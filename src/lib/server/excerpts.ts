import 'server-only';
import { randomUUID } from 'node:crypto';
import { openLibrary, setRecordTags } from './database.mjs';
import { validateNote, type SavedNote } from '../note-model';
import { validatePdf } from '../pdf-model';
import { EXCERPT_LIMITS, excerptText, type PdfExcerpt } from '../excerpt-model';
type DB = ReturnType<typeof openLibrary>;
export function excerptsForNote(db: DB, id: string): PdfExcerpt[] {
  return db.prepare(`SELECT e.id,e.note_id AS noteId,e.source_id AS sourceId,e.original_id AS originalId,e.filename,e.page,e.quotation,e.observation,e.createdAt, r.asset IS NOT NULL AS hasOriginal FROM pdf_excerpts e LEFT JOIN records r ON r.kind=e.source_kind AND r.id=e.source_id WHERE e.note_id=? ORDER BY e.createdAt,e.id`).all(id).map(row => ({ ...row, hasOriginal: !!row.hasOriginal })) as PdfExcerpt[];
}
export function changeExcerpt(input: Record<string, unknown>): SavedNote {
  if (!['add', 'delete'].includes(String(input.action)) || typeof input.noteId !== 'string' || !input.noteId || input.noteId.length > 512) throw new Error('Invalid excerpt action or note.');
  const db = openLibrary();
  try {
    db.exec('BEGIN IMMEDIATE');
    const row = db.prepare("SELECT data FROM records WHERE kind='notes' AND id=?").get(input.noteId);
    const current = row ? validateNote(JSON.parse(String(row.data))) : null;
    if ((current?.revision ?? null) !== input.noteRevision) throw new Error('This note changed or was deleted in another tab. Your excerpt draft is kept. Reload note choices before retrying.');
    const now = Date.now();
    let note: SavedNote;
    if (input.action === 'delete') {
      if (!current || typeof input.id !== 'string' || !db.prepare('SELECT id FROM pdf_excerpts WHERE id=? AND note_id=?').get(input.id, input.noteId)) throw new Error('This excerpt no longer exists. Reload notes.');
      db.prepare('DELETE FROM pdf_excerpts WHERE id=? AND note_id=?').run(input.id, input.noteId);
      note = { ...current, revision: randomUUID(), updatedAt: Math.max(now, current.updatedAt) };
    } else {
      if (typeof input.pdfId !== 'string' || !/^[a-f0-9]{64}$/.test(input.pdfId) || !Number.isSafeInteger(input.page) || Number(input.page) < 1 || typeof input.quotation !== 'string' || !input.quotation.trim() || input.quotation.length > EXCERPT_LIMITS.quotation || typeof input.observation !== 'string' || input.observation.length > EXCERPT_LIMITS.observation) throw new Error('Choose a passage up to 10,000 characters and an observation up to 5,000 characters.');
      const source = db.prepare("SELECT data FROM records WHERE kind='pdfs' AND id=?").get(input.pdfId);
      if (!source) throw new Error('The source PDF was deleted. Your draft is kept; restore the source before retrying.');
      const pdf = validatePdf(JSON.parse(String(source.data)));
      if (pdf.revision !== input.pdfRevision) throw new Error('The source PDF changed. Your draft is kept. Reopen the source page before retrying.');
      const page = pdf.pages[Number(input.page) - 1], quotation = excerptText(input.quotation);
      if (!page || !excerptText(page.text).includes(quotation)) throw new Error('The quotation must be a continuous passage from this physical page. Put your own writing in Observation.');
      if (!current && (input.newNote !== true || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200)) throw new Error('Choose an existing note or enter a title for a new note.');
      if (current && input.newNote === true) throw new Error('This note identity already exists. Reopen the excerpt form.');
      if (Number(db.prepare('SELECT COUNT(*) AS n FROM pdf_excerpts WHERE note_id=?').get(input.noteId)!.n) >= EXCERPT_LIMITS.perNote) throw new Error('A note can contain up to 100 excerpts.');
      note = current ? { ...current, revision: randomUUID(), updatedAt: Math.max(now, current.updatedAt) } : validateNote({ id: input.noteId, title: String(input.title).trim(), body: `PDF reference: ${pdf.filename}, physical page ${input.page}.`, tags: [], source: '', createdAt: now, updatedAt: now, revision: randomUUID() });
      if (!current) { db.prepare("INSERT INTO records(kind,id,data) VALUES('notes',?,?)").run(note.id, JSON.stringify(note)); setRecordTags(db, 'notes', note.id, []); }
      db.prepare(`INSERT INTO pdf_excerpts(id,note_id,source_id,original_id,filename,page,quotation,observation,createdAt) VALUES(?,?,?,?,?,?,?,?,?)`).run(randomUUID(), note.id, pdf.id, pdf.id, pdf.filename, Number(input.page), quotation, input.observation.trim(), now);
    }
    db.prepare("UPDATE records SET data=? WHERE kind='notes' AND id=?").run(JSON.stringify(note), note.id);
    const result = { ...note, excerpts: excerptsForNote(db, note.id) };
    db.exec('COMMIT'); return result;
  } finally { db.close(); }
}
