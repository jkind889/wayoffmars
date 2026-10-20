import { openNote } from './helpers/notes';
import { failStorage } from './fixtures';
import { test, expect, type Page } from "./fixtures";

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
  await openNote(page, "Editorial rhythm");
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
  await openNote(page, "Editorial rhythm");
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
  await expect(page).toHaveURL(/\/notes\//);
  page.once("dialog", dialog => dialog.accept());
  await page.reload();
  await expect(page.getByLabel("Body", { exact: true })).toHaveValue("Unfinished revision");
  await expect(page.getByRole("status").first()).toContainText("Recovered");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(card(page, "Editorial rhythm")).toContainText("Unfinished revision");
  expect(await page.evaluate(() => sessionStorage.getItem("wayoffmars-note-draft-v1"))).toBeNull();
});

for (const failure of ["quota", "abort"]) {
  test(`${failure} failure retains draft and only a committed retry claims saved`, async ({ page }) => {
    await failStorage(page, 'notes', 'save', 'Local disk operation failed. Retry.');
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
  await failStorage(page, 'notes', 'delete', 'Local disk operation failed. Retry.');
  await ready(page); await create(page);
  await openNote(page, "Editorial rhythm");
  page.once("dialog", dialog => dialog.accept());
  await card(page, "Editorial rhythm").getByRole("button", { name: "Delete Editorial rhythm" }).click();
  await expect(page.getByRole("region", { name: "Design notes", exact: true }).getByRole("alert")).toContainText("Note could not be deleted");
  await expect(card(page, "Editorial rhythm")).toBeVisible();
  await page.reload(); await expect(card(page, "Editorial rhythm")).toBeVisible();
});

test("blocked storage and failed reads are actionable without stopping writing", async ({ page }) => {
  await failStorage(page, 'notes', 'all', 'blocked by another tab');
  await ready(page); await expect(page.getByRole("region", { name: "Design notes", exact: true }).getByRole("alert")).toContainText("blocked by another tab");
  await create(page);
  await expect(page.getByRole("region", { name: "Design notes", exact: true }).getByRole("alert").filter({ hasText: "Note could not be saved" })).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Editorial rhythm");
});

test("read failures do not overwrite unread notes", async ({ page }) => {
  await ready(page); await create(page);
  await failStorage(page, 'notes', 'read', 'Local disk operation failed. Retry.');
  await page.reload(); await expect(page.getByRole("region", { name: "Design notes", exact: true }).getByRole("alert")).toContainText("Saved notes could not be read");
  await create(page, "Another idea");
  await expect(card(page, "Another idea")).toBeVisible();
  expect(await (await page.request.get('/api/library?kind=notes')).json()).toHaveLength(2);
});

test("stale tabs cannot overwrite or delete newer notes and can save edits as a copy", async ({ page, context }) => {
  await ready(page); await create(page);
  const other = await context.newPage(); await ready(other);
  await openNote(other, "Editorial rhythm");
  await card(other, "Editorial rhythm").getByRole("button", { name: "Edit Editorial rhythm" }).click();
  await other.getByLabel("Body", { exact: true }).fill("Other tab draft");
  await openNote(page, "Editorial rhythm");
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
  await expect(other.locator('.note-body')).toHaveText('Other tab draft');
  await other.getByRole('link', { name: 'Back to saved notes' }).click();
  await expect(other.getByRole('article')).toHaveCount(2);
  await page.getByRole('link', { name: 'Back to saved notes' }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('link', { name: 'Editorial rhythm', exact: true }).first().click();
  await expect(page.locator('.note-body')).toHaveText('Other tab draft');
  await page.getByRole('link', { name: 'Back to saved notes' }).click();
  await page.getByRole('link', { name: 'Editorial rhythm', exact: true }).last().click();
  await expect(page.locator('.note-body')).toHaveText('Newest committed content');
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



test("long valid tag input saves and keyboard focus returns after mutations", async ({ page }) => {
  await ready(page);
  const tags = Array.from({ length: 200 }, (_, i) => `t${i}`).join(",");
  await create(page, "Many tags", "A large set of short tags", tags);
  await expect(card(page, "Many tags")).toBeVisible();
  await expect(page.getByRole("button", { name: "New note", exact: true })).toBeFocused();
  await openNote(page, "Many tags");
  await card(page, "Many tags").getByRole("button", { name: "Edit Many tags" }).click();
  await expect(page.getByLabel("Tags Optional")).toHaveValue(tags);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await card(page, "Many tags").getByRole("button", { name: "Delete Many tags" }).click();
  await expect(card(page, "Many tags")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to saved notes" })).toBeFocused();
});
