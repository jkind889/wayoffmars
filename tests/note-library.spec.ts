import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/notes");
  await expect(page.getByRole("button", { name: "New note", exact: true })).toBeEnabled();
}
async function create(page: Page, title = "Editorial rhythm", body = "Use a baseline grid to align type and captions.", tags = "Layout, typography, layout") {
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Body", { exact: true }).fill(body);
  await page.getByLabel("Tags Optional").fill(tags);
  await page.getByLabel("Source URL").fill("https://example.com/design");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
}
const card = (page: Page, title: string) => page.getByRole("article", { name: title, exact: true });

test("create, persist, reopen, edit and delete design notes on desktop and mobile", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  // The existing checkout has no favicon; preserve the user's favicon work.
  page.on("console", msg => {
    if (msg.location().url.endsWith("/favicon.ico") && msg.text().includes("404")) return;
    if (["error", "warning"].includes(msg.type())) errors.push(`${msg.text()} ${msg.location().url}`);
  });
  const external: string[] = [];
  page.on("request", request => { if (request.url().startsWith("https://example.com")) external.push(request.url()); });
  await ready(page);
  await expect(page.getByText("Room for your next idea")).toBeVisible();
  await create(page);
  await expect(card(page, "Editorial rhythm")).toBeVisible();
  await expect(card(page, "Editorial rhythm").getByRole("listitem")).toHaveCount(2);
  await create(page, "Warm palette", "Pair terracotta with a quiet cream.", "color");
  await create(page, "Poster hierarchy", "Start with one dominant headline.", "posters");
  await page.reload(); await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page).toHaveTitle("Design notes | wayoffmars");
  await expect(page.locator("nextjs-portal").getByText("Runtime Error")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/wayoffmars-notes-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await card(page, "Editorial rhythm").getByRole("button", { name: "Edit Editorial rhythm" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Editorial grids");
  await page.getByLabel("Body", { exact: true }).fill("Use generous gutters between columns.");
  await page.screenshot({ path: "/tmp/wayoffmars-notes-editor-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(card(page, "Editorial grids")).toContainText("generous gutters");
  await page.reload(); await expect(card(page, "Editorial grids")).toBeVisible();
  await page.screenshot({ path: "/tmp/wayoffmars-notes-mobile.png", fullPage: true });
  page.once("dialog", dialog => dialog.dismiss());
  await card(page, "Editorial grids").getByRole("button", { name: "Delete Editorial grids" }).click();
  await expect(card(page, "Editorial grids")).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await card(page, "Editorial grids").getByRole("button", { name: "Delete Editorial grids" }).click();
  await expect(card(page, "Editorial grids")).toHaveCount(0);
  const reopened = await context.newPage(); await ready(reopened);
  await expect(reopened.getByRole("article")).toHaveCount(2);
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test("unsaved edits survive refresh, protect navigation and require confirmation before replacement", async ({ page }) => {
  await ready(page); await create(page);
  await card(page, "Editorial rhythm").getByRole("button", { name: "Edit Editorial rhythm" }).click();
  await page.getByLabel("Body", { exact: true }).fill("Unfinished revision");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await expect(page.getByLabel("Body", { exact: true })).toHaveValue("Unfinished revision");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Body", { exact: true })).toHaveValue("Unfinished revision");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("link", { name: "Fonts", exact: true }).click();
  await expect(page).toHaveURL(/\/notes$/);
  page.once("dialog", dialog => dialog.accept());
  await page.reload();
  await expect(page.getByLabel("Body", { exact: true })).toHaveValue("Unfinished revision");
  await expect(page.getByRole("status")).toContainText("Recovered");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(card(page, "Editorial rhythm")).toContainText("Unfinished revision");
  expect(await page.evaluate(() => sessionStorage.getItem("wayoffmars-note-draft-v1"))).toBeNull();
});

for (const failure of ["quota", "abort"]) {
  test(`${failure} failure retains draft and only a committed retry claims saved`, async ({ page }) => {
    await page.addInitScript(failure => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value) {
        if (this.name !== "notes" || sessionStorage.getItem("allowSave")) return put.call(this, value);
        if (failure === "quota") throw new DOMException("full", "QuotaExceededError");
        const request = put.call(this, value);
        request.addEventListener("success", () => this.transaction.abort()); return request;
      };
    }, failure);
    await ready(page); await create(page);
    await expect(page.getByRole("region", { name: "Design notes", exact: true }).getByRole("alert")).toContainText("Note could not be saved");
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(page.getByLabel("Body", { exact: true })).toHaveValue(/baseline grid/);
    page.once("dialog", dialog => dialog.accept()); await page.reload();
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Editorial rhythm");
    await page.evaluate(() => sessionStorage.setItem("allowSave", "yes"));
    await page.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(card(page, "Editorial rhythm")).toBeVisible();
  });
}

test("failed deletion keeps the saved note", async ({ page }) => {
  await page.addInitScript(() => { IDBObjectStore.prototype.delete = () => { throw new Error("Delete failed"); }; });
  await ready(page); await create(page);
  page.once("dialog", dialog => dialog.accept());
  await card(page, "Editorial rhythm").getByRole("button", { name: "Delete Editorial rhythm" }).click();
  await expect(page.getByRole("region", { name: "Design notes", exact: true }).getByRole("alert")).toContainText("Note could not be deleted");
  await expect(card(page, "Editorial rhythm")).toBeVisible();
  await page.reload(); await expect(card(page, "Editorial rhythm")).toBeVisible();
});

test("blocked storage and failed reads are actionable without stopping writing", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(indexedDB, "open", { value: () => {
    const request = { onblocked: null as null | (() => void) }; setTimeout(() => request.onblocked?.(), 0); return request;
  } }); });
  await ready(page); await expect(page.getByRole("region", { name: "Design notes", exact: true }).getByRole("alert")).toContainText("blocked by another tab");
  await create(page);
  await expect(page.getByRole("region", { name: "Design notes", exact: true }).getByRole("alert").filter({ hasText: "Note could not be saved" })).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Editorial rhythm");
});

test("read failures do not overwrite unread notes", async ({ page }) => {
  await ready(page); await create(page);
  await page.addInitScript(() => { IDBObjectStore.prototype.getAll = () => { throw new Error("Read failed"); }; });
  await page.reload(); await expect(page.getByRole("region", { name: "Design notes", exact: true }).getByRole("alert")).toContainText("Saved notes could not be read");
  await create(page, "Another idea");
  await expect(card(page, "Another idea")).toBeVisible();
  const count = await page.evaluate(() => new Promise<number>(resolve => {
    const open = indexedDB.open("wayoffmars-notes", 1); open.onsuccess = () => {
      const db = open.result, tx = db.transaction("notes"), req = tx.objectStore("notes").count();
      tx.oncomplete = () => { db.close(); resolve(req.result); };
    };
  })); expect(count).toBe(2);
});

test("stale tabs cannot overwrite or delete newer notes and can save edits as a copy", async ({ page, context }) => {
  await ready(page); await create(page);
  const other = await context.newPage(); await ready(other);
  await card(other, "Editorial rhythm").getByRole("button", { name: "Edit Editorial rhythm" }).click();
  await other.getByLabel("Body", { exact: true }).fill("Other tab draft");
  await card(page, "Editorial rhythm").getByRole("button", { name: "Edit Editorial rhythm" }).click();
  await page.getByLabel("Body", { exact: true }).fill("Newest committed content");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(card(page, "Editorial rhythm")).toContainText("Newest committed content");
  await other.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(other.getByRole("region", { name: "Design notes", exact: true }).getByRole("alert")).toContainText("changed in another tab");
  await expect(other.getByLabel("Body", { exact: true })).toHaveValue("Other tab draft");
  other.once("dialog", dialog => dialog.accept());
  await card(other, "Editorial rhythm").getByRole("button", { name: "Delete Editorial rhythm" }).click();
  await expect(other.getByRole("region", { name: "Design notes", exact: true }).getByRole("alert")).toContainText("Note could not be deleted");
  await other.getByRole("button", { name: "Save as new note" }).click();
  await expect(other.getByRole("article")).toHaveCount(2);
  await page.reload(); await expect(page.getByRole("article")).toHaveCount(2);
  await expect(page.getByRole("article").filter({ hasText: "Newest committed content" })).toHaveCount(1);
  await expect(page.getByRole("article").filter({ hasText: "Other tab draft" })).toHaveCount(1);
});

test("invalid source is not saved; unavailable draft storage keeps edits visible", async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException("Unavailable", "SecurityError"); }; });
  await ready(page); await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Link note");
  await page.getByLabel("Body", { exact: true }).fill("A safe source reference");
  await page.getByLabel("Source URL").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByRole("region", { name: "Design notes", exact: true }).getByRole("alert").filter({ hasText: "complete http" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Design notes", exact: true }).getByRole("alert").filter({ hasText: "Draft recovery is unavailable" })).toBeVisible();
  await expect(page.getByLabel("Body", { exact: true })).toHaveValue("A safe source reference");
  await page.getByLabel("Source URL").fill("");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(card(page, "Link note")).toBeVisible();
});

test("corrupt notes are preserved and do not hide healthy notes", async ({ page }) => {
  await ready(page); await create(page);
  await page.evaluate(() => new Promise<void>(resolve => {
    const open = indexedDB.open("wayoffmars-notes", 1); open.onsuccess = () => {
      const db = open.result, tx = db.transaction("notes", "readwrite");
      tx.objectStore("notes").put({ id: "damaged", title: "Broken" });
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await page.reload(); await expect(card(page, "Editorial rhythm")).toBeVisible();
  await expect(page.getByRole("region", { name: "Design notes", exact: true }).getByRole("alert")).toContainText("1 unreadable note");
});

test("long valid tag input saves and keyboard focus returns after mutations", async ({ page }) => {
  await ready(page);
  const tags = Array.from({ length: 200 }, (_, i) => `t${i}`).join(",");
  await create(page, "Many tags", "A large set of short tags", tags);
  await expect(card(page, "Many tags")).toBeVisible();
  await expect(page.getByRole("button", { name: "New note", exact: true })).toBeFocused();
  await card(page, "Many tags").getByRole("button", { name: "Edit Many tags" }).click();
  await expect(page.getByLabel("Tags Optional")).toHaveValue(tags);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await card(page, "Many tags").getByRole("button", { name: "Delete Many tags" }).click();
  await expect(card(page, "Many tags")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New note", exact: true })).toBeFocused();
});
