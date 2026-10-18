import { localRequest, encodeBytes, decodeBytes } from "./local-client";
import type { SavedFont } from "./font-model";
export * from "./font-model";
export const storageError = (error: unknown) => error instanceof Error ? error.message : "Local storage is unavailable. Check the app server and retry.";
export async function readSavedFonts(): Promise<unknown[]> {
  const fonts = await localRequest<Array<Omit<SavedFont, "bytes">>>("fonts");
  return Promise.all(fonts.map(async font => {
    try { return { ...font, bytes: decodeBytes(await localRequest<string>(`asset&id=${font.id}`)) }; }
    catch { return font; } // Preserve an unreadable row for per-font reporting; healthy assets still load.
  }));
}
export async function saveFont(font: SavedFont): Promise<void> {
  await localRequest("fonts", { action: "save", font: { ...font, bytes: encodeBytes(font.bytes) } });
}
export async function removeSavedFont(id: IDBValidKey): Promise<void> { await localRequest("fonts", { action: "delete", id }); }
