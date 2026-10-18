import { failStorage } from './fixtures';
import { test, expect, type Page } from "./fixtures";
import { makePdf, textPage, imagePage } from "./helpers/pdf";

const pdfRegion = (page: Page) => page.getByRole("region", { name: "PDF library", exact: true });
const search = (page: Page) => page.getByRole("searchbox", { name: "Search notes and PDFs", exact: true });
const sample = () => makePdf([textPage("Editorial grid and generous gutters."), imagePage, "BT /F1 12 Tf 40 700 Td (Kern) Tj (ing pairs need optical care.) Tj ET"]);
async function ready(page: Page) {
  await page.goto("/notes");
  await expect(page.getByRole("button", { name: "Import PDF", exact: true })).toBeEnabled();
}
async function upload(page: Page, buffer = sample(), name = "Layout guide.pdf") {
  await page.getByLabel("Choose PDF", { exact: true }).setInputFiles({ name, mimeType: "application/pdf", buffer });
}
async function imported(page: Page) {
  await upload(page);
  await expect(pdfRegion(page).getByRole("status")).toContainText("saved on this Mac");
}

test("local PDF text persists, preserves physical page references, and searches alongside notes on desktop/mobile", async ({ page }) => {
  const errors: string[] = [], external: string[] = [], writes: string[] = [], workers: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.location().url.endsWith("/favicon.ico") && message.text().includes("404")) return;
    if (["warning", "error"].includes(message.type())) errors.push(message.text());
  });
  page.on("request", request => { if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url()); if (!new URL(request.url()).hostname.match(/^(localhost|127\.0\.0\.1)$/)) external.push(request.url()); });
  page.on("worker", worker => workers.push(worker.url()));
  await ready(page);
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Grid ideas");
  await page.getByLabel("Body", { exact: true }).fill("Editorial grid in a note.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  // Exercise the native picker path; requests stay on the local app server.
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import PDF", exact: true }).click();
  await (await chooser).setFiles({ name: "Layout guide.pdf", mimeType: "application/pdf", buffer: sample() });
  await expect(pdfRegion(page).getByRole("status")).toContainText("1 page(s) have no searchable text");
  await expect.poll(() => page.workers().length).toBe(0);
  expect(workers.some(url => url.includes("pdf.worker"))).toBe(true);
  await page.reload();
  await expect(pdfRegion(page).getByRole("article", { name: "Layout guide.pdf" })).toContainText("3 pages");
  await search(page).fill("EDITORIAL grid");
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(pdfRegion(page).locator(".pdf-page-result")).toContainText("Page 1");
  await expect(pdfRegion(page).locator(".note-snippets")).toContainText("Editorial grid and generous gutters.");
  await expect(page).toHaveURL(/\/notes$/); await expect(page).toHaveTitle("Design notes | wayoffmars");
  await expect(page.locator("nextjs-portal").getByText("Runtime Error")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/wayoffmars-pdf-desktop.png", fullPage: true });
  await search(page).fill("kerning");
  await expect(pdfRegion(page).locator(".pdf-page-result")).toContainText("Page 3");
  await expect(pdfRegion(page).locator(".note-snippets mark")).toHaveText("Kerning");
  await search(page).fill("editorial kerning");
  await expect(pdfRegion(page)).toContainText("No PDF pages found");
  await search(page).fill("layout");
  await expect(pdfRegion(page).locator(".pdf-page-result")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await search(page).fill("kerning");
  await expect(pdfRegion(page).locator(".pdf-page-result")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/wayoffmars-pdf-mobile.png", fullPage: true });
  expect(external).toEqual([]); expect(writes.every(url => url.includes("/api/library"))).toBe(true); expect(errors).toEqual([]);
});

test("duplicates are skipped and confirmed deletion persists without affecting a note draft or fonts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Choose font files", exact: true })).toBeEnabled();
  await page.getByLabel("Choose font files").setInputFiles("tests/fixtures/fonts/SourceSerif4-Regular.ttf");
  await expect(page.getByText("Saved on this Mac", { exact: true })).toBeVisible();
  await ready(page); await imported(page);
  await upload(page, sample(), "Renamed.pdf");
  await expect(pdfRegion(page).getByRole("status")).toContainText("already saved");
  await expect(pdfRegion(page).getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Keep my draft");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Delete PDF Layout guide.pdf" }).click();
  await expect(pdfRegion(page).getByRole("article")).toHaveCount(1);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Delete PDF Layout guide.pdf" }).click();
  await expect(pdfRegion(page).getByRole("article")).toHaveCount(0);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Keep my draft");
  await expect(page.getByRole("button", { name: "Import PDF", exact: true })).toBeFocused();
  page.once("dialog", dialog => dialog.accept()); await page.reload();
  await expect(pdfRegion(page).getByText("0 PDFs", { exact: true })).toBeVisible();
  page.once("dialog", dialog => dialog.accept()); await page.goto("/");
  await expect(page.getByText("Saved on this Mac", { exact: true })).toBeVisible();
});

for (const [name, buffer, message] of [
  ["notes.txt", Buffer.from("hello"), "Choose a .pdf file"],
  ["empty.pdf", Buffer.alloc(0), "This PDF is empty"],
  ["renamed.pdf", Buffer.from("not PDF"), "not a valid PDF"],
  ["broken.pdf", Buffer.from("%PDF-1.7\ntruncated garbage"), "malformed or uses unsupported"],
  ["scan.pdf", makePdf([imagePage]), "No searchable text"],
  ["xfa.pdf", makePdf([textPage("Please wait...")], false, true), "XFA form PDFs are not supported"],
  ["protected.pdf", makePdf([textPage("Secret")], true), "Password-protected"],
  ["too-many-pages.pdf", makePdf(Array.from({ length: 301 }, () => textPage("Text"))), "300-page limit"],
  ["dense.pdf", makePdf([textPage("A".repeat(100_001)).replace("12 Tf", "0.001 Tf")]), "too much text"],
  ["large.pdf", Buffer.alloc(20 * 1024 * 1024 + 1), "20 MiB limit"],
] as const) {
  test(`rejects ${name} clearly without saving partial records`, async ({ page }) => {
    await ready(page); await upload(page, buffer, name);
    await expect(pdfRegion(page).getByRole("alert")).toContainText(message);
    await expect(pdfRegion(page).getByRole("article")).toHaveCount(0);
    await page.reload(); await expect(pdfRegion(page).getByText("0 PDFs", { exact: true })).toBeVisible();
  });
}

for (const failure of ["quota", "abort"]) {
  test(`PDF ${failure} failure claims no save and retry succeeds`, async ({ page }) => {
    await failStorage(page, 'pdfs', 'save', 'Local disk operation failed. Retry.');
    await ready(page); await upload(page);
    await expect(pdfRegion(page).getByRole("alert")).toContainText("PDF could not be imported");
    await expect(pdfRegion(page).getByRole("article")).toHaveCount(0);
    await page.reload(); await expect(pdfRegion(page).getByText("0 PDFs", { exact: true })).toBeVisible();
    await page.evaluate(() => sessionStorage.setItem("allowPdf", "yes")); await imported(page);
  });
}

test("failed deletion retains searchable text", async ({ page }) => {
  await failStorage(page, 'pdfs', 'delete', 'Local disk operation failed. Retry.');
  await ready(page); await imported(page);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Delete PDF Layout guide.pdf" }).click();
  await expect(pdfRegion(page).getByRole("alert")).toContainText("PDF could not be deleted");
  await page.reload(); await search(page).fill("kerning");
  await expect(pdfRegion(page).locator(".pdf-page-result")).toContainText("Page 3");
});

test("canceling a stalled worker leaves the UI usable and saves nothing", async ({ page }) => {
  await page.route("**/pdf.worker.min.mjs", route => route.fulfill({ contentType: "text/javascript", body: "// Intentionally silent worker" }));
  await ready(page); await upload(page);
  await expect(page.getByRole("button", { name: "Cancel import" })).toBeVisible();
  await search(page).fill("still responsive");
  await page.getByRole("button", { name: "Cancel import" }).click();
  await expect(pdfRegion(page).getByRole("status")).toContainText("canceled");
  await expect(page.getByRole("button", { name: "Import PDF", exact: true })).toBeEnabled();
  await page.reload(); await expect(pdfRegion(page).getByText("0 PDFs", { exact: true })).toBeVisible();
});



test("stale tabs cannot delete a PDF reimported elsewhere", async ({ page, context }) => {
  await ready(page); await imported(page);
  const other = await context.newPage(); await ready(other);
  await expect(pdfRegion(other).getByRole("article")).toHaveCount(1);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Delete PDF Layout guide.pdf" }).click();
  await expect(pdfRegion(page).getByRole("article")).toHaveCount(0);
  await imported(page);
  other.once("dialog", dialog => dialog.accept());
  await other.getByRole("button", { name: "Delete PDF Layout guide.pdf" }).click();
  await expect(pdfRegion(other).getByRole("alert")).toContainText("reimported in another tab");
  await page.reload(); await expect(pdfRegion(page).getByRole("article")).toHaveCount(1);
});

test("PDF read failure is reported and does not prevent note creation", async ({ page }) => {
  await failStorage(page, 'pdfs', 'read', 'Local disk operation failed. Retry.');
  await ready(page);
  await expect(pdfRegion(page).getByRole("alert")).toContainText("Saved PDFs could not be read");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Still writing");
  await page.getByLabel("Body", { exact: true }).fill("This note stays independent.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByRole("article", { name: "Still writing", exact: true })).toBeVisible();
});

test("extraction timeout releases the import controls without storing partial text", async ({ page }) => {
  await page.route("**/pdf.worker.min.mjs", route => route.fulfill({ contentType: "text/javascript", body: "// Intentionally silent worker" }));
  await ready(page);
  await page.clock.install();
  await upload(page);
  await expect(page.getByRole("button", { name: "Cancel import" })).toBeVisible();
  await page.clock.fastForward(60_001);
  await expect(pdfRegion(page).getByRole("alert")).toContainText("extraction timed out");
  await expect(page.getByRole("button", { name: "Import PDF", exact: true })).toBeEnabled();
  await expect(pdfRegion(page).getByRole("article")).toHaveCount(0);
});
