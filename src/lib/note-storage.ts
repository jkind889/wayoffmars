import { localRequest } from "./local-client";
import { NoteConflictError, type SavedNote } from "./note-model";
export * from "./note-model";
export const noteStorageError = (error: unknown) => error instanceof Error ? error.message : "Local storage is unavailable. Check the app server and retry.";
export const readNotes = (): Promise<unknown[]> => localRequest("notes");
export async function writeNote(note: SavedNote | null, id: string, expectedRevision: string | null): Promise<void> {
  try { await localRequest("notes", { action: "write", note, id, expectedRevision }); }
  catch (error) { if (error instanceof Error && error.message.includes("changed in another tab")) throw new NoteConflictError(); throw error; }
}
