/** Browser-only note storage, isolated from the existing font database. */
export const NOTE_DATABASE = "wayoffmars-notes";
const STORE = "notes";
export const NOTE_LIMITS = { title: 200, body: 50000, tags: 1000, source: 2048 };
export type NoteFields = { title: string; body: string; tags: string; source: string };
export type SavedNote = {
  id: string; title: string; body: string; tags: string[]; source: string;
  createdAt: number; updatedAt: number; revision: string;
};
export const EMPTY_NOTE: NoteFields = { title: "", body: "", tags: "", source: "" };
export function noteFields(note: SavedNote): NoteFields {
  return { title: note.title, body: note.body, tags: note.tags.join(","), source: note.source };
}
export function validFields(value: unknown): value is NoteFields {
  if (!value || typeof value !== "object") return false;
  return Object.entries(NOTE_LIMITS).every(([key, limit]) => {
    const field = (value as Record<string, unknown>)[key];
    return typeof field === "string" && field.length <= limit;
  });
}
export function validateSource(source: string): boolean {
  if (!source) return true;
  try { return ["http:", "https:"].includes(new URL(source).protocol); } catch { return false; }
}
export function validateNote(value: unknown): SavedNote {
  const note = value as SavedNote;
  if (!note || typeof note !== "object" || typeof note.id !== "string" || !note.id ||
      typeof note.revision !== "string" || !note.revision || !Array.isArray(note.tags) ||
      !note.tags.every(tag => typeof tag === "string" && tag.trim()) ||
      !validFields({ ...note, tags: note.tags.join(",") }) || !note.title.trim() || !note.body.trim() ||
      !validateSource(note.source) || !Number.isFinite(note.createdAt) || note.createdAt < 0 ||
      !Number.isFinite(note.updatedAt) || note.updatedAt < note.createdAt) {
    throw new Error("Unreadable note record. Its stored data has been kept.");
  }
  return note;
}
export function makeNote(fields: NoteFields, id: string, original: SavedNote | null): SavedNote {
  if (!validFields(fields)) throw new Error("A note field exceeds its allowed length.");
  const tags = [...new Map(fields.tags.split(",").map(tag => tag.trim()).filter(Boolean).map(tag => [tag.toLowerCase(), tag])).values()];
  return validateNote({ id, title: fields.title.trim(), body: fields.body.trim(), tags,
    source: fields.source.trim(), createdAt: original?.createdAt ?? Date.now(),
    updatedAt: Math.max(Date.now(), original?.createdAt ?? 0), revision: crypto.randomUUID() });
}
export function noteStorageError(error: unknown): string {
  if (error instanceof Error && error.name === "QuotaExceededError") return "Browser storage is full. Free space and retry. Your edits are still here.";
  if (error instanceof Error && error.name === "VersionError") return "These notes were saved by a newer app version. Update the app and retry.";
  return error instanceof Error ? error.message : "Browser storage is unavailable. Retry after checking browser permissions.";
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => fail(new Error("Opening note storage timed out. Close other wayoffmars tabs and retry.")), 5000);
    function fail(error: unknown) { settled = true; clearTimeout(timer); reject(error); }
    try {
      const request = indexedDB.open(NOTE_DATABASE, 1);
      request.onupgradeneeded = () => {
        if (settled) { request.transaction?.abort(); return; }
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error("Note storage is blocked by another tab. Close other wayoffmars tabs and retry."));
      request.onsuccess = () => {
        clearTimeout(timer);
        if (settled) { request.result.close(); return; }
        settled = true;
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    } catch (error) { fail(error); }
  });
}
async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore, result: (value: T) => void, fail: (error: Error) => void) => void): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction | undefined;
    let result: T;
    let failure: Error | undefined;
    try {
      transaction = database.transaction(STORE, mode);
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onabort = () => { database.close(); reject(failure ?? transaction?.error ?? new Error("Note storage operation was aborted. Retry saving.")); };
      operation(transaction.objectStore(STORE), value => { result = value; }, error => { failure = error; transaction?.abort(); });
    } catch (error) { transaction?.abort(); database.close(); reject(error); }
  });
}
export function readNotes(): Promise<unknown[]> {
  return transact("readonly", (store, result) => { const request = store.getAll(); request.onsuccess = () => result(request.result); });
}
export class NoteConflictError extends Error {
  constructor() { super("This note changed in another tab. Your edits are still here. Save them as a new note, or cancel and reload to read the latest version."); }
}
/** Check the revision and write in the same transaction to prevent stale-tab data loss. */
export function writeNote(note: SavedNote | null, id: string, expectedRevision: string | null): Promise<void> {
  if (note) validateNote(note);
  return transact("readwrite", (store, result, fail) => {
    const request = store.get(id);
    request.onsuccess = () => {
      if ((request.result?.revision ?? null) !== expectedRevision) { fail(new NoteConflictError()); return; }
      try { if (note) store.put(note); else store.delete(id); result(undefined); }
      catch (error) { fail(error instanceof Error ? error : new Error("Note could not be saved.")); }
    };
  });
}
