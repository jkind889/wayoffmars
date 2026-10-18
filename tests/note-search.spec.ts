import { test, expect, type Page } from "@playwright/test";
import { highlightText, matchingSnippets, searchNotes, searchTerms } from "../src/lib/note-search";
import type { SavedNote } from "../src/lib/note-storage";

const note = (id: string, title: string, body: string, tags: string[] = [], updatedAt = 1): SavedNote => ({ id, title, body, tags, source: "https://example.com/sourceonly", createdAt: 1, updatedAt, revision: id });

test("ranking prefers exact titles, title matches, tags, then bodies with stable recency and identity ties", () => {
  const notes = [note("b", "Color", "A grid", [], 4), note("a", "Spacing", "A grid", [], 4), note("old", "Other", "A grid"), note("tag", "System", "Rhythm", ["grid"]), note("title", "Grid systems", "Rhythm"), note("exact", "Grid", "Rhythm")];
  const expected = ["exact", "title", "tag", "a", "b", "old"];
  expect(searchNotes(notes, "GRID").map(result => result.note.id)).toEqual(expected);
  expect(searchNotes([...notes].reverse(), "grid").map(result => result.note.id)).toEqual(expected);
  expect(searchNotes(notes, " \n ").map(result => result.note.id)).toEqual(["a", "b", "exact", "old", "tag", "title"]);
});

test("all literal keywords must occur across searchable fields, never just the source", () => {
  const notes = [note("mixed", "Editorial grid", "Use a baseline", ["Type"]), note("partial", "Editorial grid", "Spacing")];
  expect(searchNotes(notes, " TYPE   editorial\nBASELINE ").map(result => result.note.id)).toEqual(["mixed"]);
  expect(searchNotes(notes, "type missing")).toHaveLength(0);
  expect(searchNotes(notes, "sourceonly")).toHaveLength(0);
  expect(searchTerms(" Grid grid GRID ")).toHaveLength(1);
  const literal = [note("literal", "C++ [grid]", "Use (red).*? safely")];
  expect(searchNotes(literal, "C++ [grid] (red).*?")).toHaveLength(1);
  expect(searchNotes(literal, ".*missing")).toHaveLength(0);
});

test("snippets expose distant matches and preserve Unicode and literal text", () => {
  const body = `${"Introduction. ".repeat(30)}Kerning fixes pairs. ${"More context. ".repeat(35)}Optical spacing matters. ${"End. ".repeat(70)}`;
  const snippets = matchingSnippets(body, ["kerning", "optical"]);
  expect(snippets).toHaveLength(2);
  expect(snippets[0]).toContain("Kerning"); expect(snippets[1]).toContain("Optical");
  expect(snippets[0].startsWith("…")).toBe(true);
  expect(snippets.every(text => text.length <= 322)).toBe(true);
  const text = "İstanbul — CAFÉ <script>alert(1)</script> gridline";
  const terms = searchTerms("İstanbul café grid gridline");
  expect(searchNotes([note("unicode", text, "Body")], "İstanbul café")).toHaveLength(1);
  const parts = highlightText(text, terms);
  expect(parts.map(part => part.text).join("")).toBe(text);
  expect(parts.filter(part => part.match).map(part => part.text)).toEqual(["İstanbul", "CAFÉ", "gridline"]);
});

test("snippets remain bounded when many keywords form an overlapping chain", () => {
  const terms = Array.from({ length: 30 }, (_, i) => `t${i}`);
  const body = terms.map(term => `${term} ${"filler ".repeat(20)}`).join(" ");
  const snippets = matchingSnippets(body, terms);
  expect(snippets.length).toBeLessThanOrEqual(3);
  expect(snippets.every(text => text.length <= 322)).toBe(true);
  expect(matchingSnippets("A short body", ["title-only"])).toEqual(["A short body"]);
});

async function ready(page: Page) {
  await page.goto("/notes");
  await expect(page.getByRole("button", { name: "New note", exact: true })).toBeEnabled();
}
async function create(page: Page, title: string, body: string, tags: string) {
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Body", { exact: true }).fill(body);
  await page.getByLabel("Tags Optional").fill(tags);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved in this browser");
}

test("saved notes are found by title, body and tags after refresh with snippets and desktop/mobile states", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", msg => {
    if (msg.location().url.endsWith("/favicon.ico") && msg.text().includes("404")) return;
    if (["warning", "error"].includes(msg.type())) errors.push(msg.text());
  });
  await ready(page);
  await create(page, "Editorial grid", "Align headlines with captions and leave generous gutters.", "layout, typography");
  await create(page, "Warm palette", "Terracotta and cream create a quiet warmth.", "color");
  await create(page, "Optical corrections", `${"Start with a careful type specimen. ".repeat(20)}Kerning adjusts the space between specific pairs. ${"Compare at print size. ".repeat(20)}`, "typography");
  await page.reload(); await expect(page.getByRole("article")).toHaveCount(3);
  const search = page.getByRole("searchbox", { name: "Search notes and PDFs", exact: true });
  await search.fill("EDITORIAL");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article").getByRole("heading")).toHaveText("Editorial grid");
  await expect(page.getByRole("article").locator("mark")).toContainText(["Editorial"]);
  await search.fill("kerning");
  await expect(page.getByRole("article")).toHaveAccessibleName("Optical corrections");
  await expect(page.locator(".note-snippets")).toContainText("Kerning adjusts");
  await expect(page.locator(".note-snippets mark")).toHaveText("Kerning");
  await page.getByText("Read full note", { exact: true }).click();
  await expect(page.locator(".note-full-text .note-body")).toBeVisible();
  await expect(page).toHaveURL(/\/notes$/); await expect(page).toHaveTitle("Design notes | wayoffmars");
  await expect(page.locator("nextjs-portal").getByText("Runtime Error")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/wayoffmars-search-full-note.png", fullPage: true });
  await page.getByText("Read full note", { exact: true }).click();
  await search.fill("typography");
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(page.locator(".note-tags mark")).toHaveCount(2);
  await page.screenshot({ path: "/tmp/wayoffmars-search-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await search.fill("typography kerning");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toHaveAccessibleName("Optical corrections");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/wayoffmars-search-mobile.png", fullPage: true });
  await search.fill("nothingmatches");
  await expect(page.getByText("No notes found", { exact: true })).toBeVisible();
  await expect(page.getByText("0 of 3 notes", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/wayoffmars-search-empty-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Show all notes" }).click();
  await expect(search).toBeFocused(); await expect(search).toHaveValue("");
  await expect(page.getByRole("article")).toHaveCount(3);
  await search.fill(" \t "); await expect(page.getByRole("article")).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("search keeps drafts and reflects saved edits and deletions immediately", async ({ page }) => {
  await ready(page);
  await create(page, "Color study", "A warm palette", "color");
  await page.getByRole("button", { name: "Edit Color study" }).click();
  await page.getByLabel("Body", { exact: true }).fill("A cool palette");
  const search = page.getByRole("searchbox", { name: "Search notes and PDFs", exact: true });
  await search.fill("no match");
  await expect(page.getByLabel("Body", { exact: true })).toHaveValue("A cool palette");
  await search.fill("cool"); await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.locator(".note-snippets mark")).toHaveText("cool");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Delete Color study" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.reload(); await expect(page.getByRole("article")).toHaveCount(0);
});

test("empty library stays useful during search and HTML-looking input stays plain text", async ({ page }) => {
  await ready(page);
  const search = page.getByRole("searchbox", { name: "Search notes and PDFs", exact: true });
  await search.fill("grid"); await expect(page.getByText("Room for your next idea")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await create(page, "C++ [grid]", '<img src=x onerror="alert(1)"> and literal (.*)', "code");
  await search.fill("C++ [grid] (.*)");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article").locator("img, script")).toHaveCount(0);
  await expect(page.locator(".note-snippets")).toContainText('<img src=x onerror="alert(1)">');
});
