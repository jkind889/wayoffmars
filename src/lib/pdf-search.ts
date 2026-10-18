import { matchingSnippets, searchTerms } from "./note-search";
import type { SavedPdf } from "./pdf-model";

export type PdfMatch = { pdf: SavedPdf; page: number; snippets: string[]; score: number };
export const PDF_RESULT_LIMIT = 100;
/** Every literal keyword must occur in the filename or the SAME page. */
export async function searchPdfs(pdfs: SavedPdf[], query: string, signal?: AbortSignal): Promise<{ matches: PdfMatch[]; total: number }> {
  const terms = searchTerms(query);
  if (!terms.length) return { matches: [], total: 0 };
  const patterns = terms.map(term => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"));
  const matches: PdfMatch[] = [];
  let total = 0, batchStart = performance.now();
  for (const pdf of pdfs) {
    const filenameMatches = patterns.map(pattern => pattern.test(pdf.filename));
    for (const page of pdf.pages) {
      signal?.throwIfAborted();
      if (page.text && patterns.every((pattern, index) => filenameMatches[index] || pattern.test(page.text))) {
        total++;
        const score = filenameMatches.reduce((sum, match) => sum + (match ? 10 : 1), 0);
        matches.push({ pdf, page: page.number, score, snippets: matchingSnippets(page.text, terms) });
        matches.sort((a, b) => b.score - a.score || b.pdf.importedAt - a.pdf.importedAt || a.pdf.id.localeCompare(b.pdf.id) || a.page - b.page);
        if (matches.length > PDF_RESULT_LIMIT) matches.pop();
      }
      if (performance.now() - batchStart > 8) {
        await new Promise(resolve => setTimeout(resolve, 0)); batchStart = performance.now();
      }
    }
  }
  return { matches, total };
}
