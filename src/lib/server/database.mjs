// Node-only implementation shared by the server repository and backup CLI.
import { tagKey } from '../tag-model.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, openSync, closeSync, writeFileSync, fsyncSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';

export const dataDirectory = () => resolve(/* turbopackIgnore: true */ process.env.WAYOFFMARS_DATA_DIR || join(homedir(), 'Library', 'Application Support', 'wayoffmars'));
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function assetPath(directory, id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid asset identity.');
  return join(directory, 'assets', id);
}
export function readAsset(directory, id) {
  let bytes;
  try { bytes = readFileSync(assetPath(directory, id)); }
  catch { throw new Error('The local asset is missing or unreadable. Restore a backup or reselect the original file.'); }
  if (digest(bytes) !== id) throw new Error('Local asset checksum mismatch. Restore a backup or reselect the original file.');
  return bytes;
}
export function storeAsset(directory, id, bytes) {
  const target = assetPath(directory, id);
  if (digest(bytes) !== id) throw new Error('File checksum mismatch. Nothing was associated.');
  if (existsSync(target)) {
    try { readAsset(directory, id); return; } catch { /* Replace damaged bytes only with verified original bytes. */ }
  }
  const temporary = join(directory, 'assets', `.pending-${randomUUID()}`);
  try {
    const fd = openSync(temporary, 'wx', 0o600);
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, target);
    const directoryFd = openSync(join(directory, 'assets'), 'r');
    try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}
export function openLibrary(directory = dataDirectory()) {
  mkdirSync(join(directory, 'assets'), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(directory, 'library.sqlite'), { timeout: 5000 });
  try {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
    db.exec('BEGIN IMMEDIATE');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 4) throw new Error('This library needs a newer app version. Update before opening it.');
    if (version === 0) db.exec(`
      CREATE TABLE records (kind TEXT NOT NULL CHECK(kind IN ('notes','pdfs','fonts')), id TEXT NOT NULL, data TEXT NOT NULL, asset TEXT, PRIMARY KEY(kind,id)) STRICT;
      CREATE TABLE imports (kind TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(kind,id,fingerprint)) STRICT;
    `);
    if (version < 2) db.exec(`
      CREATE TABLE records_v2 (kind TEXT NOT NULL CHECK(kind IN ('notes','pdfs','fonts','images')), id TEXT NOT NULL, data TEXT NOT NULL, asset TEXT, PRIMARY KEY(kind,id)) STRICT;
      INSERT INTO records_v2 SELECT * FROM records;
      DROP TABLE records;
      ALTER TABLE records_v2 RENAME TO records;
      PRAGMA user_version=2;
    `);
    if (version < 3) db.exec(`
      CREATE TABLE image_links (
        note_kind TEXT NOT NULL DEFAULT 'notes' CHECK(note_kind='notes'),
        note_id TEXT NOT NULL,
        image_kind TEXT NOT NULL DEFAULT 'images' CHECK(image_kind='images'),
        image_id TEXT NOT NULL,
        PRIMARY KEY(note_id,image_id),
        FOREIGN KEY(note_kind,note_id) REFERENCES records(kind,id) ON DELETE CASCADE,
        FOREIGN KEY(image_kind,image_id) REFERENCES records(kind,id) ON DELETE CASCADE
      ) STRICT;
      CREATE INDEX image_links_by_image ON image_links(image_id);
      PRAGMA user_version=3;
    `);
    if (version < 4) {
      db.exec(`
        CREATE TABLE tags (key TEXT PRIMARY KEY, label TEXT NOT NULL) STRICT;
        CREATE TABLE record_tags (
          kind TEXT NOT NULL CHECK(kind IN ('notes','images','pdfs')),
          record_id TEXT NOT NULL,
          tag_key TEXT NOT NULL,
          PRIMARY KEY(kind,record_id,tag_key),
          FOREIGN KEY(kind,record_id) REFERENCES records(kind,id) ON DELETE CASCADE,
          FOREIGN KEY(tag_key) REFERENCES tags(key)
        ) STRICT;
        CREATE INDEX record_tags_by_tag ON record_tags(tag_key);
      `);
      // Leave source JSON and import fingerprints untouched, including unreadable
      // records. Recover all usable labels without rewriting historical notes.
      for (const row of db.prepare("SELECT id,data FROM records WHERE kind='notes' ORDER BY id").all()) {
        let note;
        try { note = JSON.parse(row.data); } catch { continue; }
        if (Array.isArray(note?.tags)) setRecordTags(db, 'notes', row.id, note.tags.filter(tag => typeof tag === 'string' && tag.trim()));
      }
      db.exec('PRAGMA user_version=4');
    }
    db.exec('COMMIT');
    return db;
  } catch (error) { db.close(); throw error; }
}

// Call inside the record mutation's transaction. Vocabulary survives unlinking,
// so an unused label remains available for reuse. First spelling wins globally.
export function setRecordTags(db, kind, id, labels) {
  db.prepare('DELETE FROM record_tags WHERE kind=? AND record_id=?').run(kind, id);
  for (const label of labels) {
    const key = tagKey(label);
    db.prepare('INSERT INTO tags(key,label) VALUES(?,?) ON CONFLICT DO NOTHING').run(key, label.trim());
    db.prepare('INSERT INTO record_tags VALUES(?,?,?) ON CONFLICT DO NOTHING').run(kind, id, key);
  }
}
