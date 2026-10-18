import { validatePdf, type SavedPdf } from "./pdf-model";

/** Separate adapter: PDF text never modifies note or font stores. */
export const PDF_DATABASE = "wayoffmars-pdfs";
const STORE = "pdfs";
export function pdfStorageError(error: unknown): string {
  if (error instanceof Error && error.name === "QuotaExceededError") return "Browser storage is full. Free space and import again.";
  if (error instanceof Error && error.name === "VersionError") return "These PDFs were saved by a newer app version. Update the app and retry.";
  return error instanceof Error ? error.message : "Browser storage is unavailable. Check browser permissions and retry.";
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => fail(new Error("Opening PDF storage timed out. Close other wayoffmars tabs and retry.")), 5000);
    function fail(error: unknown) { settled = true; clearTimeout(timer); reject(error); }
    try {
      const request = indexedDB.open(PDF_DATABASE, 1);
      request.onupgradeneeded = () => {
        if (settled) { request.transaction?.abort(); return; }
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error("PDF storage is blocked by another tab. Close other wayoffmars tabs and retry."));
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
      transaction.onabort = () => { database.close(); reject(failure ?? transaction?.error ?? new Error("PDF storage operation was aborted. Retry importing.")); };
      operation(transaction.objectStore(STORE), value => { result = value; }, error => { failure = error; transaction?.abort(); });
    } catch (error) { transaction?.abort(); database.close(); reject(error); }
  });
}
export function readPdfs(): Promise<unknown[]> {
  return transact("readonly", (store, result) => { const request = store.getAll(); request.onsuccess = () => result(request.result); });
}
/** Immutable imports: atomically skip duplicates, including across tabs. */
export function savePdf(pdf: SavedPdf): Promise<boolean> {
  validatePdf(pdf);
  return transact("readwrite", (store, result, fail) => {
    const request = store.get(pdf.id);
    request.onsuccess = () => {
      try {
        if (request.result) { validatePdf(request.result); result(false); }
        else { store.add(pdf); result(true); }
      } catch (error) { fail(error instanceof Error ? error : new Error("PDF could not be saved.")); }
    };
  });
}
export function deletePdf(pdf: SavedPdf): Promise<void> {
  return transact("readwrite", (store, result, fail) => {
    const request = store.get(pdf.id);
    request.onsuccess = () => {
      if (request.result && request.result.revision !== pdf.revision) {
        fail(new Error("This PDF was reimported in another tab. Refresh before deleting it.")); return;
      }
      try { store.delete(pdf.id); result(undefined); }
      catch (error) { fail(error instanceof Error ? error : new Error("PDF could not be deleted.")); }
    };
  });
}
