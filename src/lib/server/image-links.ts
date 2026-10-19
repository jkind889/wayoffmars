import 'server-only';
import { openLibrary } from './database.mjs';
export type ImageLink = { noteId: string; imageId: string };
export function readImageLinks(): ImageLink[] {
  const db = openLibrary();
  try { return db.prepare('SELECT note_id AS noteId,image_id AS imageId FROM image_links ORDER BY note_id,image_id').all() as ImageLink[]; }
  finally { db.close(); }
}
export function changeImageLink(input: Record<string, unknown>) {
  if ((input.action !== 'link' && input.action !== 'unlink') || typeof input.noteId !== 'string' || !input.noteId || input.noteId.length > 512 || typeof input.imageId !== 'string' || !/^[a-f0-9]{64}$/.test(input.imageId)) throw new Error('Invalid image/note link.');
  const db = openLibrary();
  try {
    db.exec('BEGIN IMMEDIATE');
    const note = db.prepare("SELECT data FROM records WHERE kind='notes' AND id=?").get(input.noteId);
    const image = db.prepare("SELECT data FROM records WHERE kind='images' AND id=?").get(input.imageId);
    if (!note || !image) throw new Error('This note or image was deleted. Refresh links before retrying.');
    if (JSON.parse(String(note.data)).revision !== input.noteRevision || JSON.parse(String(image.data)).revision !== input.imageRevision) throw new Error('This note or image changed in another tab. Refresh links before retrying.');
    if (input.action === 'link') db.prepare('INSERT INTO image_links(note_id,image_id) VALUES(?,?) ON CONFLICT DO NOTHING').run(input.noteId, input.imageId);
    else db.prepare('DELETE FROM image_links WHERE note_id=? AND image_id=?').run(input.noteId, input.imageId);
    db.exec('COMMIT'); return true;
  } finally { db.close(); }
}
