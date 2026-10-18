import type { SavedPdf } from "./pdf-model";
import { localRequest, encodeBytes } from "./local-client";
export const pdfStorageError = (error: unknown) => error instanceof Error ? error.message : "Local storage is unavailable. Check the app server and retry.";
export const readPdfs = (): Promise<unknown[]> => localRequest("pdfs");
export const savePdf = (pdf: SavedPdf, bytes: ArrayBuffer): Promise<boolean> => localRequest("pdfs", { action: "save", pdf, original: encodeBytes(bytes) });
export const attachOriginal = (pdf: SavedPdf, bytes: ArrayBuffer): Promise<boolean> => localRequest("pdfs", { action: "attach", id: pdf.id, revision: pdf.revision, original: encodeBytes(bytes) });
export async function deletePdf(pdf: SavedPdf): Promise<void> { await localRequest("pdfs", { action: "delete", id: pdf.id, revision: pdf.revision }); }
