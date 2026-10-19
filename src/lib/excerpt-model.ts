/** Citation pages are physical, one-based PDF page numbers. Whitespace is normalized only. */
export const excerptText = (text: string) => text.replace(/\s+/gu, ' ').trim();
export const EXCERPT_LIMITS = { quotation: 10000, observation: 5000, perNote: 100 };
export type PdfExcerpt = { id: string; noteId: string; sourceId: string | null; originalId: string; filename: string; page: number; quotation: string; observation: string; createdAt: number; hasOriginal: boolean };
