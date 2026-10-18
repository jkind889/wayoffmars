import { test, expect } from "@playwright/test";
import { searchPdfs, PDF_RESULT_LIMIT } from "../src/lib/pdf-search";
import { validatePdf, type SavedPdf } from "../src/lib/pdf-model";

const pdf = (texts: string[], filename = "Guide.pdf", id = "a".repeat(64), importedAt = 1): SavedPdf => ({ id, filename, importedAt, byteSize: 100, revision: "first", pages: texts.map((text, index) => ({ number: index + 1, text })) });

test("PDF search uses literal keywords within one page plus filename and preserves empty page offsets", async () => {
  const source = pdf(["Editorial grid", "", "CAFÉ C++ [grid] <script>alert(1)</script>"]);
  expect((await searchPdfs([source], "café [grid] guide")).matches).toMatchObject([{ page: 3, snippets: ["CAFÉ C++ [grid] <script>alert(1)</script>"] }]);
  expect((await searchPdfs([source], "editorial café")).total).toBe(0);
  expect((await searchPdfs([source], ".*")).total).toBe(0);
  expect((await searchPdfs([source], "GUIDE")).matches.map(match => match.page)).toEqual([1, 3]);
  expect((await searchPdfs([source], " \n ")).total).toBe(0);
});

test("bounded PDF results rank filename hits, then recency, identity and page; report the full count", async () => {
  const many = pdf(Array.from({ length: 150 }, (_, i) => `A grid on page ${i + 1}`));
  const title = pdf(["Use spacing"], "Grid.pdf", "b".repeat(64), 0);
  const newer = pdf(["grid"], "New.pdf", "c".repeat(64), 2);
  const results = await searchPdfs([many, title, newer], "grid");
  expect(results.total).toBe(152); expect(results.matches).toHaveLength(PDF_RESULT_LIMIT);
  expect(results.matches.slice(0, 3).map(match => [match.pdf.filename, match.page])).toEqual([["Grid.pdf", 1], ["New.pdf", 1], ["Guide.pdf", 1]]);
  expect(results.matches.at(-1)?.page).toBe(98);
  const controller = new AbortController(); controller.abort();
  await expect(searchPdfs([many], "grid", controller.signal)).rejects.toThrow();
});

test("invalid PDF records cannot change physical page references or bypass text limits", () => {
  const good = pdf(["First", "", "Third"]);
  expect(validatePdf(good)).toBe(good);
  for (const invalid of [
    { ...good, pages: [{ number: 2, text: "wrong" }] },
    { ...good, pages: [good.pages[0], , good.pages[2]] },
    { ...good, pages: [{ number: 1, text: "" }] },
    { ...good, pages: [{ number: 1, text: "x".repeat(100_001) }] },
    { ...good, id: [good.id] },
    { ...good, revision: null },
  ]) expect(() => validatePdf(invalid)).toThrow("Unreadable PDF record");
});
