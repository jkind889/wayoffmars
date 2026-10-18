import { failStorage, resetLibrary } from './fixtures';
import { test, expect, type Page } from "./fixtures";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fixture = (extension: string) => path.join(__dirname, "fixtures/fonts", `SourceSerif4-Regular.${extension}`);
const picker = (page: Page) => page.getByLabel("Choose font files", { exact: true });
const saved = (page: Page) => page.getByText("Saved on this Mac", { exact: true });
async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Choose font files", exact: true })).toBeEnabled();
}
async function drop(page: Page, name: string, bytes: number[]) {
  const transfer = await page.evaluateHandle(({ name, bytes }) => {
    const data = new DataTransfer(); data.items.add(new File([new Uint8Array(bytes)], name)); return data;
  }, { name, bytes });
  await page.getByRole("region", { name: "Select font files" }).dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
}
async function proveGlyphs(page: Page, count: number) {
  // CDP reports fonts that actually supplied rendered glyphs, unlike CSS family or fonts.check().
  const session = await page.context().newCDPSession(page);
  await session.send("DOM.enable"); await session.send("CSS.enable");
  const { root } = await session.send("DOM.getDocument");
  const { nodeIds } = await session.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: ".font-sample" });
  expect(nodeIds).toHaveLength(count);
  for (const [index, nodeId] of nodeIds.entries()) {
    // Below-the-fold samples may not have been shaped yet. Inspect each after scrolling it into view.
    await page.locator(".font-sample").nth(index).scrollIntoViewIfNeeded();
    await expect.poll(async () => {
      const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
      return fonts.some((font) => font.isCustomFont && font.glyphCount > 0 && /Source Serif/i.test(font.familyName));
    }).toBe(true);
  }
  await session.detach();
}

test("all four real formats render custom glyphs and survive reload and a reopened page", async ({ page, context }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  await picker(page).setInputFiles([fixture("ttf"), fixture("otf"), fixture("woff"), fixture("woff2")]);
  await expect(saved(page)).toHaveCount(4); await proveGlyphs(page, 4);
  await page.reload(); await expect(saved(page)).toHaveCount(4); await proveGlyphs(page, 4);
  const reopened = await context.newPage(); await page.close(); await ready(reopened);
  await expect(saved(reopened)).toHaveCount(4); await proveGlyphs(reopened, 4);
  expect(await reopened.title()).toBe("Font library | wayoffmars");
  await expect(reopened.locator("nextjs-portal").getByText("Runtime Error")).toHaveCount(0);
  await reopened.screenshot({ path: "/tmp/wayoffmars-desktop.png", fullPage: true });
  await reopened.setViewportSize({ width: 390, height: 844 });
  expect(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await reopened.screenshot({ path: "/tmp/wayoffmars-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

for (const extension of ["ttf", "otf", "woff", "woff2"]) {
  test(`drop ${extension}, renamed duplicate, and repeat picker deduplicate contents`, async ({ page }) => {
    await ready(page); const bytes = Array.from(await readFile(fixture(extension)));
    await drop(page, `original.${extension}`, bytes); await expect(saved(page)).toHaveCount(1);
    await drop(page, `renamed.${extension}`, bytes);
    await expect(page.getByRole("status")).toContainText("1 duplicate file skipped");
    await picker(page).setInputFiles(fixture(extension));
    await expect(page.locator(".font-row")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Choose font files", exact: true })).toBeEnabled();
    await proveGlyphs(page, 1);
  });
}

test("invalid mixed batch keeps valid font and reports empty, extension, signature, size and decode errors", async ({ page }) => {
  await ready(page);
  await picker(page).setInputFiles([
    { name: "empty.ttf", mimeType: "font/ttf", buffer: Buffer.alloc(0) },
    { name: "wrong.txt", mimeType: "text/plain", buffer: Buffer.from("text") },
    { name: "fake.otf", mimeType: "font/otf", buffer: Buffer.from("fake-font") },
    { name: "huge.ttf", mimeType: "font/ttf", buffer: Buffer.alloc(20 * 1024 * 1024 + 1) },
    { name: "damaged.ttf", mimeType: "font/ttf", buffer: Buffer.from([0, 1, 0, 0, 0, 0, 0, 0]) },
    { name: "valid.ttf", mimeType: "font/ttf", buffer: await readFile(fixture("ttf")) },
  ]);
  await expect(saved(page)).toHaveCount(1); await expect(page.locator(".font-error")).toHaveCount(5);
  for (const message of ["empty", "Choose a TTF", "supported font", "too large", "could not decode"]) {
    await expect(page.locator(".font-error").filter({ hasText: message })).toHaveCount(1);
  }
  await page.reload(); await expect(page.locator(".font-row")).toHaveCount(1);
});

test("unreadable selected file does not stop the next file", async ({ page }) => {
  await page.addInitScript(() => { const read = File.prototype.arrayBuffer; File.prototype.arrayBuffer = function () {
    return this.name === "unreadable.ttf" ? Promise.reject(new Error("read failure")) : read.call(this);
  }; });
  await ready(page); await picker(page).setInputFiles([
    { name: "unreadable.ttf", mimeType: "font/ttf", buffer: await readFile(fixture("ttf")) }, { name: "valid.otf", mimeType: "font/otf", buffer: await readFile(fixture("otf")) },
  ]);
  await expect(saved(page)).toHaveCount(1); await expect(page.locator(".font-error")).toContainText("could not be read");
});

test("quota failure stays preview-only and can retry saving", async ({ page }) => {
  await failStorage(page, 'fonts', 'save', 'Browser storage is full');
  await ready(page); await picker(page).setInputFiles(fixture("ttf"));
  await expect(page.getByText("Preview only — not saved", { exact: true })).toBeVisible();
  await expect(saved(page)).toHaveCount(0); await expect(page.getByRole("status")).toContainText("Browser storage is full");
  await page.evaluate(() => sessionStorage.setItem("allowSave", "yes"));
  await page.getByRole("button", { name: "Retry saving" }).click(); await expect(saved(page)).toHaveCount(1);
});

test("transaction abort after request success never claims saved", async ({ page }) => {
  await failStorage(page, 'fonts', 'save', 'Local disk operation failed. Retry.');
  await ready(page); await picker(page).setInputFiles(fixture("ttf"));
  await expect(page.getByText("Preview only — not saved", { exact: true })).toBeVisible();
  await expect(saved(page)).toHaveCount(0); await page.reload(); await expect(page.locator(".font-row")).toHaveCount(0);
});

test("blocked database gives actionable feedback and still previews", async ({ page }) => {
  await failStorage(page, 'fonts', 'all', 'blocked by another tab');
  await ready(page); await expect(page.getByRole("status")).toContainText("blocked by another tab");
  await picker(page).setInputFiles(fixture("ttf"));
  await expect(page.getByText("Preview only — not saved", { exact: true })).toBeVisible();
});

test("database read failure still allows a new saved import", async ({ page }) => {
  await failStorage(page, 'fonts', 'read', 'Local disk operation failed. Retry.');
  await ready(page); await expect(page.getByRole("status")).toContainText("Saved fonts could not be read");
  await picker(page).setInputFiles(fixture("ttf")); await expect(saved(page)).toHaveCount(1);
});



test("text drags do not highlight and file drags reset on leave", async ({ page }) => {
  await ready(page); const zone = page.getByRole("region", { name: "Select font files" });
  const text = await page.evaluateHandle(() => { const data = new DataTransfer(); data.setData("text/plain", "hello"); return data; });
  await zone.dispatchEvent("dragover", { dataTransfer: text }); await expect(zone).not.toHaveClass(/is-dragging/);
  const file = await page.evaluateHandle(() => { const data = new DataTransfer(); data.items.add(new File(["invalid"], "test.ttf")); return data; });
  await zone.dispatchEvent("dragover", { dataTransfer: file }); await expect(zone).toHaveClass(/is-dragging/);
  await zone.dispatchEvent("dragleave", { relatedTarget: null }); await expect(zone).not.toHaveClass(/is-dragging/);
});

test("preview text and size update loaded fonts at desktop and mobile widths", async ({ page }) => {
  await ready(page); await picker(page).setInputFiles(fixture("ttf")); await expect(saved(page)).toHaveCount(1);
  await page.getByRole("textbox", { name: "Preview text", exact: true }).fill("Type you collect.\nHamburgefontsiv 0123456789");
  await page.getByRole("slider", { name: /Preview size/ }).press("End");
  await expect(page.locator(".font-sample")).toHaveText("Type you collect.\nHamburgefontsiv 0123456789");
  await expect(page.locator(".font-sample")).toHaveCSS("font-size", "96px"); await proveGlyphs(page, 1);
  await page.screenshot({ path: "/tmp/wayoffmars-controls-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/wayoffmars-controls-mobile.png", fullPage: true });
});

test("remove unregisters font, undo restores it, and committed removal survives refresh", async ({ page }) => {
  await ready(page); await picker(page).setInputFiles(fixture("ttf")); await expect(saved(page)).toHaveCount(1);
  const family = await page.locator(".font-sample").evaluate(el => getComputedStyle(el).fontFamily);
  await page.getByRole("button", { name: "Remove SourceSerif4-Regular.ttf", exact: true }).click();
  await expect(page.locator(".font-row")).toHaveCount(0);
  expect(await page.evaluate(family => Array.from(document.fonts).some(font => font.family === family.replaceAll('"', '')), family)).toBe(false);
  await page.getByRole("button", { name: "Undo removal" }).click(); await expect(saved(page)).toHaveCount(1); await proveGlyphs(page, 1);
  await page.reload(); await expect(saved(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Remove SourceSerif4-Regular.ttf", exact: true }).click();
  await expect(page.locator(".font-row")).toHaveCount(0); await page.reload(); await expect(page.locator(".font-row")).toHaveCount(0);
});

test("failed removal keeps the saved row and its rendered font", async ({ page }) => {
  await failStorage(page, 'fonts', 'delete', 'Local disk operation failed. Retry.');
  await ready(page); await picker(page).setInputFiles(fixture("ttf")); await expect(saved(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Remove SourceSerif4-Regular.ttf", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Font could not be removed");
  await expect(saved(page)).toHaveCount(1); await proveGlyphs(page, 1);
});

test("backup contains exact font bytes and versioned metadata; fresh-profile restoration deduplicates", async ({ page, browser }) => {
  await ready(page); await picker(page).setInputFiles([fixture("ttf"), fixture("woff2")]); await expect(saved(page)).toHaveCount(2);
  const downloadEvent = page.waitForEvent("download"); await page.getByRole("button", { name: "Export backup", exact: true }).click();
  const download = await downloadEvent; const backupPath = await download.path(); expect(backupPath).toBeTruthy();
  const backup = JSON.parse(await readFile(backupPath!, "utf8"));
  expect(backup.format).toBe("wayoffmars-font-backup"); expect(backup.version).toBe(1); expect(backup.fonts).toHaveLength(2);
  for (const entry of backup.fonts) {
    expect(Buffer.from(entry.data, "base64")).toEqual(await readFile(path.join(__dirname, "fixtures/fonts", entry.name)));
    expect(entry.size).toBe(Buffer.from(entry.data, "base64").length);
    expect(entry.id).toMatch(/^[a-f0-9]{64}$/); expect(entry.addedAt).toBeGreaterThan(0);
  }
  resetLibrary();
  const isolated = await browser.newContext(); const restored = await isolated.newPage();
  try {
    await ready(restored); await expect(restored.locator(".font-row")).toHaveCount(0);
    await restored.getByLabel("Choose backup file", { exact: true }).setInputFiles(backupPath!);
    await expect(saved(restored)).toHaveCount(2); await proveGlyphs(restored, 2);
    await restored.reload(); await expect(saved(restored)).toHaveCount(2);
    await restored.getByLabel("Choose backup file", { exact: true }).setInputFiles(backupPath!);
    await expect(restored.getByRole("status")).toContainText("2 duplicate files skipped");
    await expect(restored.locator(".font-row")).toHaveCount(2);
    const metadata = await (await restored.request.get('/api/library?kind=fonts')).json();
    expect(metadata).toEqual(expect.arrayContaining(backup.fonts.map(({ id, name, size, addedAt }: { id: string; name: string; size: number; addedAt: number }) => ({ id, name, size, addedAt }))));
  } finally { await isolated.close(); }
  await expect(saved(page)).toHaveCount(2);
});

test("backup restoration keeps mixed-entry successes and rejects bad checksums, metadata and bytes", async ({ page }) => {
  const bytes = await readFile(fixture("ttf"));
  const { createHash } = await import("node:crypto");
  const valid = { id: createHash("sha256").update(bytes).digest("hex"), name: "backup.ttf", size: bytes.length, addedAt: Date.now(), encoding: "base64", data: bytes.toString("base64") };
  const manifest = { format: "wayoffmars-font-backup", version: 1, fonts: [valid,
    { ...valid, id: "a".repeat(64) }, { ...valid, size: 7 }, { ...valid, data: "not base64!" }, { ...valid, name: "renamed.ttf" },
  ] };
  await ready(page); await page.getByLabel("Choose backup file", { exact: true }).setInputFiles({ name: "mixed.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(manifest)) });
  await expect(saved(page)).toHaveCount(1); await expect(page.locator(".font-error")).toHaveCount(3);
  await expect(page.getByRole("status")).toContainText("1 duplicate file skipped");
  await proveGlyphs(page, 1); await page.reload(); await expect(page.locator(".font-row")).toHaveCount(1);
});

test("invalid backup envelopes make no changes to an existing library", async ({ page }) => {
  await ready(page); await picker(page).setInputFiles(fixture("ttf")); await expect(saved(page)).toHaveCount(1);
  for (const data of ["not-json", JSON.stringify({ format: "wayoffmars-font-backup", version: 999, fonts: [] }), JSON.stringify({ format: "wayoffmars-font-backup", version: 1, fonts: {} })]) {
    await page.getByLabel("Choose backup file", { exact: true }).setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from(data) });
    await expect(page.getByRole("status")).toContainText(/backup/i);
    await expect(page.getByRole("button", { name: "Import backup", exact: true })).toBeEnabled();
    await expect(saved(page)).toHaveCount(1);
  }
});

test("export includes preview-only fonts after a quota failure", async ({ page }) => {
  await failStorage(page, 'fonts', 'save', 'Browser storage is full');
  await ready(page); await picker(page).setInputFiles(fixture("ttf"));
  await expect(page.getByText("Preview only — not saved", { exact: true })).toBeVisible();
  const downloadEvent = page.waitForEvent("download"); await page.getByRole("button", { name: "Export backup", exact: true }).click();
  const download = await downloadEvent, backupPath = await download.path();
  const backup = JSON.parse(await readFile(backupPath!, "utf8")); expect(backup.fonts).toHaveLength(1);
  expect(Buffer.from(backup.fonts[0].data, "base64")).toEqual(await readFile(fixture("ttf")));
});
