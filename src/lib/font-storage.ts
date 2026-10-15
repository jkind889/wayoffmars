import { validateFontBytes } from "./font-loader";

/** Browser-only operations: nothing opens IndexedDB during server rendering. */
export const DATABASE_NAME = "wayoffmars-fonts";
export const DATABASE_VERSION = 1;
const STORE = "fonts";

export type SavedFont = {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  size: number;
  addedAt: number;
};

export function storageError(error: unknown): string {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  if (name === "QuotaExceededError") return "Browser storage is full. Export a backup or free space, then retry saving.";
  if (name === "VersionError") return "This library was saved by a newer app version. Update the app to read it.";
  return error instanceof Error ? error.message : "Browser storage is unavailable. Check browser permissions and retry.";
}

export async function validateSavedFont(value: unknown): Promise<SavedFont> {
  if (!value || typeof value !== "object") throw new Error("Invalid saved font record.");
  const font = value as SavedFont;
  if (typeof font.id !== "string" || !/^[a-f0-9]{64}$/.test(font.id) ||
      typeof font.name !== "string" || !/\.(ttf|otf|woff2?)$/i.test(font.name) || font.name.length > 512 ||
      !(font.bytes instanceof ArrayBuffer) || font.size !== font.bytes.byteLength ||
      !Number.isFinite(font.addedAt) || font.addedAt < 0) {
    throw new Error("Invalid saved font metadata. Its stored data has been kept.");
  }
  validateFontBytes(font.bytes);
  if (await fontIdentity(font.bytes) !== font.id) throw new Error("Saved font checksum mismatch. Its stored data has been kept.");
  return font;
}

export async function fontIdentity(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("This browser does not provide local font storage.")); return; }
    let settled = false;
    const timer = setTimeout(() => fail(new Error("Opening font storage timed out. Close other wayoffmars tabs and retry.")), 5000);
    function fail(error: unknown) {
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (settled) { request.transaction?.abort(); return; }
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new Error("Font storage is blocked by another tab. Close other wayoffmars tabs and retry."));
    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) { request.result.close(); return; }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

/** All operations close their connection, including synchronous request failures. */
async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction | undefined;
    try {
      transaction = database.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      transaction.oncomplete = () => { database.close(); resolve(request.result); };
      transaction.onabort = () => {
        database.close(); reject(transaction?.error ?? new Error("Browser storage operation was aborted. Retry saving."));
      };
    } catch (error) {
      transaction?.abort(); database.close(); reject(error);
    }
  });
}

export function readSavedFonts(): Promise<unknown[]> {
  return transact("readonly", (store) => store.getAll());
}

export async function saveFont(font: SavedFont): Promise<void> {
  // Request success is provisional; only transaction completion means saved.
  await transact("readwrite", (store) => store.put(font));
}

export async function removeSavedFont(id: IDBValidKey): Promise<void> {
  await transact("readwrite", (store) => store.delete(id));
}
