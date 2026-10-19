import 'server-only';
import { importImage, changeImage } from './images';
import { isDeepStrictEqual } from 'node:util';
import { dataDirectory, digest, openLibrary, setRecordTags, readAsset, storeAsset } from './database.mjs';
import { validateNote, NoteConflictError } from '../note-model';
import { validatePdf, PDF_LIMITS } from '../pdf-model';
import { validateSavedFont } from '../font-model';

export type Kind = 'notes' | 'pdfs' | 'fonts' | 'images';
export function kindOf(value: unknown): Kind {
  if (value !== 'notes' && value !== 'pdfs' && value !== 'fonts' && value !== 'images') throw new Error('Invalid library kind.');
  return value;
}
const identity = (id: unknown): string => {
  if (typeof id !== 'string' || !id || id.length > 512) throw new Error('Invalid record identity.');
  return id;
};
// Opening per operation keeps transactions short and makes restarts and CLI backups independent.
function using<T>(fn: (db: ReturnType<typeof openLibrary>, directory: string) => T): T {
  const directory = dataDirectory(), db = openLibrary(directory);
  try { return fn(db, directory); } finally { db.close(); }
}
export function list(kind: Kind): unknown[] {
  return using(db => db.prepare('SELECT data,asset FROM records WHERE kind=? ORDER BY id').all(kind).map(row => ({ ...JSON.parse(String(row.data)), ...(kind === 'pdfs' ? { hasOriginal: !!row.asset } : {}) })));
}
export function pdfRecord(id: string) {
  return using(db => {
    const row = db.prepare("SELECT data,asset FROM records WHERE kind='pdfs' AND id=?").get(identity(id));
    if (!row) throw new Error('This PDF is no longer in the library.');
    return { ...validatePdf(JSON.parse(String(row.data))), hasOriginal: !!row.asset };
  });
}
export function pdfOriginal(id: string): Buffer {
  return using((db, directory) => {
    const row = db.prepare("SELECT data,asset FROM records WHERE kind='pdfs' AND id=?").get(identity(id));
    if (!row?.asset) throw new Error('No original is attached. Reselect the original PDF; its checksum must match.');
    const bytes = readAsset(directory, id);
    if (bytes.byteLength !== validatePdf(JSON.parse(String(row.data))).byteSize) throw new Error('PDF file size mismatch. Reselect the original PDF.');
    return bytes;
  });
}
function pdfBytes(value: unknown, id: string, size: number): Buffer {
  if (typeof value !== 'string' || value.length > 28 * 1024 * 1024) throw new Error('PDF original bytes are required (up to 20 MiB).');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || !bytes.length || bytes.length > PDF_LIMITS.bytes || !bytes.subarray(0,1024).includes(Buffer.from('%PDF-'))) throw new Error('Invalid PDF original bytes.');
  if (bytes.length !== size || digest(bytes) !== id) throw new Error('PDF checksum mismatch. Choose the exact original file; nothing was associated.');
  return bytes;
}
export function asset(id: string): string {
  return using((db, directory) => {
    if (!db.prepare('SELECT id FROM records WHERE asset=?').get(id)) throw new Error('This asset is not associated with a saved record.');
    return readAsset(directory, id).toString('base64');
  });
}
function transaction<T>(db: ReturnType<typeof openLibrary>, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
async function validated(kind: Kind, value: unknown) {
  let bytes: Buffer | undefined;
  let data: Record<string, unknown>;
  if (kind === 'notes') {
    const note = validateNote(value);
    data = { id: note.id, title: note.title, body: note.body, tags: note.tags, source: note.source, createdAt: note.createdAt, updatedAt: note.updatedAt, revision: note.revision };
  } else if (kind === 'pdfs') {
    const pdf = validatePdf(value);
    data = { id: pdf.id, filename: pdf.filename, byteSize: pdf.byteSize, pages: pdf.pages.map(p => ({ number: p.number, text: p.text })), importedAt: pdf.importedAt, revision: pdf.revision };
  } else {
    const font = value as Record<string, unknown>;
    if (!font || typeof font.bytes !== 'string' || font.bytes.length > 28 * 1024 * 1024) throw new Error('Invalid font bytes.');
    bytes = Buffer.from(font.bytes, 'base64');
    if (bytes.toString('base64') !== font.bytes) throw new Error('Invalid font encoding.');
    const valid = await validateSavedFont({ ...font, bytes: Uint8Array.from(bytes).buffer });
    data = { id: valid.id, name: valid.name, size: valid.size, addedAt: valid.addedAt };
  }
  identity(data.id);
  return { data, bytes };
}
export async function mutate(kind: Kind, input: Record<string, unknown>) {
  if (kind === 'images') return input.action === 'save' ? importImage(input) : changeImage(input);
  const action = input.action;
  if (kind === 'pdfs' && action === 'attach') {
    const id = identity(input.id);
    return using((db, directory) => transaction(db, () => {
      const row = db.prepare("SELECT data FROM records WHERE kind='pdfs' AND id=?").get(id);
      if (!row) throw new Error('This PDF was deleted. Refresh the library before retrying.');
      const current = validatePdf(JSON.parse(String(row.data)));
      if (current.revision !== input.revision) throw new Error('This PDF was reimported in another tab. Refresh before attaching an original.');
      const bytes = pdfBytes(input.original, id, current.byteSize);
      storeAsset(directory, id, bytes);
      db.prepare("UPDATE records SET asset=? WHERE kind='pdfs' AND id=?").run(id, id);
      return true;
    }));
  }
  if (action === 'import' || action === 'save' || action === 'write' && input.note !== null) {
    const value = action === 'import' ? input.record : kind === 'notes' ? input.note : kind === 'pdfs' ? input.pdf : input.font;
    const checked = await validated(kind, value);
    const data = checked.data;
    const bytes = kind === 'pdfs' && action === 'save' ? pdfBytes(input.original, String(data.id), Number(data.byteSize)) : checked.bytes;
    const id = String(data.id);
    if (action === 'write' && input.id !== id) throw new Error('Note identity mismatch.');
    return using((db, directory) => transaction(db, () => {
      const row = db.prepare('SELECT data,asset FROM records WHERE kind=? AND id=?').get(kind, id);
      const current = row ? JSON.parse(String(row.data)) : null;
      const fingerprint = digest(JSON.stringify(data));
      if (action === 'import') {
        if (db.prepare('SELECT id FROM imports WHERE kind=? AND id=? AND fingerprint=?').get(kind, id, fingerprint)) return 'already imported';
        if (current && !isDeepStrictEqual(current, data)) return 'conflict';
      } else if (kind === 'notes') {
        if ((current?.revision ?? null) !== input.expectedRevision) throw new NoteConflictError();
        if (current && (current.createdAt !== data.createdAt || current.revision === data.revision)) throw new Error('Invalid note revision.');
      } else if (current) return false;
      if (bytes) storeAsset(directory, id, bytes);
      db.prepare('INSERT INTO records(kind,id,data,asset) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data, asset=excluded.asset').run(kind, id, JSON.stringify(data), bytes ? id : row?.asset ?? null);
      if (kind === 'notes') setRecordTags(db, kind, id, data.tags);
      if (action === 'import') {
        const saved = db.prepare('SELECT data,asset FROM records WHERE kind=? AND id=?').get(kind, id);
        if (!saved || !isDeepStrictEqual(JSON.parse(String(saved.data)), data)) throw new Error('Import verification failed.');
        if (bytes) readAsset(directory, id);
        db.prepare('INSERT INTO imports VALUES(?,?,?)').run(kind, id, fingerprint);
        return current ? 'verified existing' : 'imported and verified';
      }
      return true;
    }));
  }
  if (action === 'delete' || action === 'write' && input.note === null) {
    const id = identity(input.id);
    return using(db => transaction(db, () => {
      const row = db.prepare('SELECT data,asset FROM records WHERE kind=? AND id=?').get(kind, id);
      const current = row ? JSON.parse(String(row.data)) : null;
      if (kind === 'notes' && (current?.revision ?? null) !== input.expectedRevision) throw new NoteConflictError();
      if (kind === 'pdfs' && current && current.revision !== input.revision) throw new Error('This PDF was reimported in another tab. Refresh before deleting it.');
      db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id);
      // Immutable assets are retained for backups in progress; no unsafe cross-process deletion.
      return true;
    }));
  }
  throw new Error('Unknown library operation.');
}
