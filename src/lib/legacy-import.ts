import { localRequest, encodeBytes } from './local-client';
import { validateNote } from './note-model';
import { validatePdf } from './pdf-model';
import { loadFontBytes } from './font-loader';
import { validateSavedFont } from './font-model';
export type LegacyKind = 'notes' | 'pdfs' | 'fonts';
/** Read-only; abort creation if this origin never had a legacy database. */
export function readLegacy(kind: LegacyKind): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    let settled = false, absent = false;
    const timer = setTimeout(() => { settled = true; reject(new Error('Browser database timed out. Close older tabs and retry.')); }, 5000);
    const request = indexedDB.open(`wayoffmars-${kind}`, 1);
    request.onupgradeneeded = () => { absent = true; request.transaction?.abort(); };
    request.onblocked = () => { clearTimeout(timer); settled = true; reject(new Error('Browser database is blocked. Close older tabs and retry.')); };
    request.onerror = () => { clearTimeout(timer); if (!settled) { settled = true; if (absent) resolve([]); else reject(request.error); } };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      const db = request.result;
      try {
        const tx = db.transaction(kind, 'readonly'), read = tx.objectStore(kind).getAll();
        tx.oncomplete = () => { clearTimeout(timer); db.close(); if (!settled) resolve(read.result); settled = true; };
        tx.onabort = () => { clearTimeout(timer); db.close(); if (!settled) reject(tx.error); settled = true; };
      } catch (error) { clearTimeout(timer); db.close(); settled = true; reject(error); }
    };
  });
}
export async function importLegacyRecord(kind: LegacyKind, record: unknown): Promise<string> {
  let value: unknown;
  if (kind === 'notes') value = validateNote(record);
  else if (kind === 'pdfs') value = validatePdf(record);
  else { const font = await validateSavedFont(record); await loadFontBytes(font.bytes, 'legacy-import-validation'); value = { ...font, bytes: encodeBytes(font.bytes) }; }
  return localRequest(kind, { action: 'import', record: value });
}
