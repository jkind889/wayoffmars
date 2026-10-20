import 'server-only';
import { randomUUID } from 'node:crypto';
import { openLibrary, setRecordTags, setCollectionTags, collectionTags } from './database.mjs';
import { normalizeTags } from '../tag-model.mjs';
import type { Tag, TagLibrary, TaggedRecord } from '../tag-storage';

function assignments(db: ReturnType<typeof openLibrary>, kind: string, id: string): Tag[] {
  return db.prepare('SELECT t.key,t.label FROM record_tags r JOIN tags t ON t.key=r.tag_key WHERE r.kind=? AND r.record_id=? ORDER BY t.key').all(kind, id) as Tag[];
}
export function readTagLibrary(): TagLibrary {
  const db = openLibrary();
  try {
    db.exec('BEGIN');
    const vocabulary = db.prepare('SELECT t.key,t.label,COUNT(r.tag_key) AS count FROM tags t LEFT JOIN (SELECT tag_key FROM record_tags UNION ALL SELECT tag_key FROM collection_tags) r ON t.key=r.tag_key GROUP BY t.key ORDER BY t.key').all() as TagLibrary['vocabulary'];
    const records = db.prepare("SELECT kind,id,data FROM records WHERE kind IN ('notes','images','pdfs') ORDER BY kind,id").all().flatMap(row => {
      let data;
      try { data = JSON.parse(String(row.data)); } catch { return []; }
      if (!data || typeof data.revision !== 'string' || typeof (data.title ?? data.filename) !== 'string') return [];
      return [{ kind: row.kind, id: row.id, title: data.title ?? data.filename, revision: data.revision, addedAt: data.createdAt ?? data.importedAt ?? 0, tags: assignments(db, String(row.kind), String(row.id)) } as TaggedRecord];
    });
    for (const row of db.prepare('SELECT * FROM collections ORDER BY id').all()) {
      records.push({ kind: 'collections', id: String(row.id), title: String(row.name), revision: String(row.revision), addedAt: Number(row.createdAt), tags: collectionTags(db, row.id) as TaggedRecord['tags'] });
    }
    db.exec('COMMIT');
    return { vocabulary, records };
  } finally { db.close(); }
}
export function changeTags(input: Record<string, unknown>): TaggedRecord {
  if (!['notes', 'images', 'pdfs', 'collections'].includes(String(input.kind)) || typeof input.kind !== 'string' || typeof input.id !== 'string' || !input.id || input.id.length > 512 || typeof input.expectedRevision !== 'string' || !input.expectedRevision) throw new Error('Invalid tag assignment.');
  const labels = normalizeTags(input.tags), db = openLibrary();
  try {
    db.exec('BEGIN IMMEDIATE');
    if (input.kind === 'collections') {
      const current = db.prepare('SELECT * FROM collections WHERE id=?').get(input.id);
      if (!current || current.revision !== input.expectedRevision) throw new Error('This collection changed or was deleted. Your tag edits are still here. Cancel and reload before retrying.');
      const revision = randomUUID();
      setCollectionTags(db, input.id, labels);
      db.prepare('UPDATE collections SET revision=?,updatedAt=? WHERE id=?').run(revision, Math.max(Date.now(), Number(current.updatedAt)), input.id);
      const result: TaggedRecord = { kind: 'collections', id: input.id, title: String(current.name), revision, addedAt: Number(current.createdAt), tags: collectionTags(db, input.id) as TaggedRecord['tags'] };
      db.exec('COMMIT'); return result;
    }
    const row = db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(input.kind, input.id);
    if (!row) throw new Error('This item was deleted. Reload the Tags view.');
    const current = JSON.parse(String(row.data));
    if (current.revision !== input.expectedRevision) throw new Error('This item changed in another tab. Your tag edits are still here. Cancel and reload before retrying.');
    const data = { ...current, revision: randomUUID() };
    if (input.kind === 'notes') data.tags = labels;
    if (input.kind !== 'pdfs') data.updatedAt = Math.max(Date.now(), current.updatedAt, current.createdAt);
    setRecordTags(db, input.kind, input.id, labels);
    db.prepare('UPDATE records SET data=? WHERE kind=? AND id=?').run(JSON.stringify(data), input.kind, input.id);
    const result = { kind: input.kind as TaggedRecord['kind'], id: input.id, title: data.title ?? data.filename, revision: data.revision, addedAt: data.createdAt ?? data.importedAt ?? 0, tags: assignments(db, input.kind, input.id) };
    db.exec('COMMIT');
    return result;
  } finally { db.close(); }
}
