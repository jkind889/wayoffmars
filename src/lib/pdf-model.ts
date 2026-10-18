/** Storage-independent text records; physical page numbers are one-based. */
export const PDF_LIMITS = { bytes: 20 * 1024 * 1024, pages: 300, pageCharacters: 100_000, characters: 2_000_000, timeoutMs: 60_000 };
export type PdfPage = { number: number; text: string };
export type PdfText = { id: string; filename: string; byteSize: number; pages: PdfPage[] };
export type SavedPdf = PdfText & { importedAt: number; revision: string; hasOriginal?: boolean };

export function validatePdf(value: unknown): SavedPdf {
  const pdf = value as SavedPdf;
  if (!pdf || typeof pdf !== "object" || typeof pdf.id !== "string" || !/^[a-f0-9]{64}$/.test(pdf.id) ||
      typeof pdf.filename !== "string" || !pdf.filename.trim() || pdf.filename.length > 255 ||
      !Number.isInteger(pdf.byteSize) || pdf.byteSize <= 0 || pdf.byteSize > PDF_LIMITS.bytes ||
      !Number.isFinite(pdf.importedAt) || pdf.importedAt < 0 || typeof pdf.revision !== "string" || !pdf.revision ||
      !Array.isArray(pdf.pages) || !pdf.pages.length || pdf.pages.length > PDF_LIMITS.pages ||
      !Array.from(pdf.pages).every((page, index) => page && page.number === index + 1 && typeof page.text === "string" && page.text.length <= PDF_LIMITS.pageCharacters) ||
      !pdf.pages.some(page => page.text.trim()) || pdf.pages.reduce((sum, page) => sum + page.text.length, 0) > PDF_LIMITS.characters) {
    throw new Error("Unreadable PDF record. Its stored data has been kept.");
  }
  return pdf;
}
