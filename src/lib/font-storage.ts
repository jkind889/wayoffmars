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

export async function readSavedFonts(): Promise<unknown[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try { transaction = database.transaction(STORE, "readonly"); }
    catch (error) { database.close(); reject(error); return; }
    const request = transaction.objectStore(STORE).getAll();
    transaction.oncomplete = () => { database.close(); resolve(request.result); };
    transaction.onabort = () => { database.close(); reject(transaction.error); };
  });
}

export async function saveFont(font: SavedFont): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(font);
    } catch (error) { database.close(); reject(error); return; }
    // Request success is provisional; only transaction completion means saved.
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onabort = () => { database.close(); reject(transaction.error); };
  });
}
