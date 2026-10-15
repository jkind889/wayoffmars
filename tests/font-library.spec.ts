import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fixture = (extension: string) => path.join(__dirname, "fixtures/fonts", `SourceSerif4-Regular.${extension}`);
const picker = (page: Page) => page.getByLabel("Choose font files", { exact: true });
const saved = (page: Page) => page.getByText("Saved in this browser", { exact: true });
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
  for (const nodeId of nodeIds) {
    const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
    expect(fonts.some((font) => font.isCustomFont && font.glyphCount > 0 && /Source Serif/i.test(font.familyName))).toBe(true);
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
  await page.addInitScript(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (value) {
    if (!sessionStorage.getItem("allowSave")) throw new DOMException("quota", "QuotaExceededError"); return put.call(this, value);
  }; });
  await ready(page); await picker(page).setInputFiles(fixture("ttf"));
  await expect(page.getByText("Preview only — not saved", { exact: true })).toBeVisible();
  await expect(saved(page)).toHaveCount(0); await expect(page.getByRole("status")).toContainText("Browser storage is full");
  await page.evaluate(() => sessionStorage.setItem("allowSave", "yes"));
  await page.getByRole("button", { name: "Retry saving" }).click(); await expect(saved(page)).toHaveCount(1);
});

test("transaction abort after request success never claims saved", async ({ page }) => {
  await page.addInitScript(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (value) {
    const request = put.call(this, value); request.addEventListener("success", () => this.transaction.abort()); return request;
  }; });
  await ready(page); await picker(page).setInputFiles(fixture("ttf"));
  await expect(page.getByText("Preview only — not saved", { exact: true })).toBeVisible();
  await expect(saved(page)).toHaveCount(0); await page.reload(); await expect(page.locator(".font-row")).toHaveCount(0);
});

test("blocked database gives actionable feedback and still previews", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(indexedDB, "open", { value: () => {
    const request = { onblocked: null as null | (() => void) }; setTimeout(() => request.onblocked?.(), 0); return request;
  } }); });
  await ready(page); await expect(page.getByRole("status")).toContainText("blocked by another tab");
  await picker(page).setInputFiles(fixture("ttf"));
  await expect(page.getByText("Preview only — not saved", { exact: true })).toBeVisible();
});

test("database read failure still allows a new saved import", async ({ page }) => {
  await page.addInitScript(() => { IDBObjectStore.prototype.getAll = () => { throw new Error("Read failed"); }; });
  await ready(page); await expect(page.getByRole("status")).toContainText("Saved fonts could not be read");
  await picker(page).setInputFiles(fixture("ttf")); await expect(saved(page)).toHaveCount(1);
});

test("corrupt metadata, checksums and undecodable saved records do not lose healthy records", async ({ page }) => {
  await ready(page); await picker(page).setInputFiles(fixture("ttf")); await expect(saved(page)).toHaveCount(1);
  await page.evaluate(async () => {
    const damaged = new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0]).buffer;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", damaged)), b => b.toString(16).padStart(2, "0")).join("");
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("wayoffmars-fonts", 1); open.onsuccess = () => {
        const db = open.result; const tx = db.transaction("fonts", "readwrite"); const store = tx.objectStore("fonts");
        store.put({ id: "bad-metadata", name: "broken.ttf" });
        store.put({ id: "a".repeat(64), name: "checksum.ttf", bytes: damaged, size: 8, addedAt: Date.now() });
        store.put({ id: hash, name: "damaged.ttf", bytes: damaged, size: 8, addedAt: Date.now() });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
      };
    });
  });
  await page.reload(); await expect(saved(page)).toHaveCount(1); await expect(page.locator(".font-error")).toHaveCount(3);
  await proveGlyphs(page, 1);
  const count = await page.evaluate(() => new Promise<number>(resolve => {
    const open = indexedDB.open("wayoffmars-fonts", 1); open.onsuccess = () => {
      const db = open.result, tx = db.transaction("fonts"), request = tx.objectStore("fonts").count();
      tx.oncomplete = () => { db.close(); resolve(request.result); };
    };
  })); expect(count).toBe(4);
});

test("text drags do not highlight and file drags reset on leave", async ({ page }) => {
  await ready(page); const zone = page.getByRole("region", { name: "Select font files" });
  const text = await page.evaluateHandle(() => { const data = new DataTransfer(); data.setData("text/plain", "hello"); return data; });
  await zone.dispatchEvent("dragover", { dataTransfer: text }); await expect(zone).not.toHaveClass(/is-dragging/);
  const file = await page.evaluateHandle(() => { const data = new DataTransfer(); data.items.add(new File(["invalid"], "test.ttf")); return data; });
  await zone.dispatchEvent("dragover", { dataTransfer: file }); await expect(zone).toHaveClass(/is-dragging/);
  await zone.dispatchEvent("dragleave", { relatedTarget: null }); await expect(zone).not.toHaveClass(/is-dragging/);
});
