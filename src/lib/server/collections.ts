import 'server-only';
import { randomUUID } from 'node:crypto';
import { normalizeTags } from '../tag-model.mjs';
import { openLibrary, setCollectionTags, collectionTags } from './database.mjs';
import { memberKey, type Collection, type CollectionsLibrary, type Member } from '../collection-model';

type DB = ReturnType<typeof openLibrary>;
function collection(db: DB, id: string): Collection {
  const row = db.prepare('SELECT * FROM collections WHERE id=?').get(id);
  if (!row) throw new Error('This collection was deleted. Reload collections.');
  return { ...row, tags: collectionTags(db, id), members: db.prepare('SELECT kind,record_id AS id FROM collection_members WHERE collection_id=? ORDER BY position').all(id) } as Collection;
}
export function readCollections(): CollectionsLibrary {
  const db = openLibrary();
  try {
    db.exec('BEGIN');
    const collections = db.prepare('SELECT id FROM collections ORDER BY createdAt,id').all().map(row => collection(db, String(row.id)));
    const items = db.prepare('SELECT kind,id,data FROM records ORDER BY kind,id').all().flatMap(row => {
      try {
        const data = JSON.parse(String(row.data)), title = data.title ?? data.filename ?? data.name;
        if (typeof title !== 'string') return [];
        return [{ kind: row.kind, id: row.id, title, preview: String(data.body ?? data.description ?? data.pages?.[0]?.text ?? `${data.size ?? 0} bytes · Saved font`).slice(0, 400) } as CollectionsLibrary['items'][number]];
      } catch { return []; }
    });
    const vocabulary = db.prepare('SELECT key,label FROM tags ORDER BY key').all() as CollectionsLibrary['vocabulary'];
    db.exec('COMMIT'); return { collections, items, vocabulary };
  } finally { db.close(); }
}
export function changeCollection(input: Record<string, unknown>): Collection | null {
  if (!['save', 'delete'].includes(String(input.action)) || typeof input.id !== 'string' || !/^[a-f0-9-]{36}$/.test(input.id)) throw new Error('Invalid collection identity or action.');
  const db = openLibrary();
  try {
    db.exec('BEGIN IMMEDIATE');
    const row = db.prepare('SELECT * FROM collections WHERE id=?').get(input.id);
    if ((row?.revision ?? null) !== input.expectedRevision) throw new Error('This collection changed or was deleted in another tab. Reload before retrying.');
    if (input.action === 'delete') {
      db.prepare('DELETE FROM collections WHERE id=?').run(input.id); db.exec('COMMIT'); return null;
    }
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120 || !Array.isArray(input.members) || input.members.length > 100) throw new Error('Use a collection name up to 120 characters and at most 100 items.');
    if (!row && Number(db.prepare('SELECT COUNT(*) AS count FROM collections').get()!.count) >= 100) throw new Error('The library supports up to 100 collections.');
    const members: Member[] = input.members.map(value => {
      if (!value || !['notes','images','pdfs','fonts'].includes(value.kind) || typeof value.id !== 'string' || !value.id || value.id.length > 512) throw new Error('Invalid collection member.');
      if (!db.prepare('SELECT id FROM records WHERE kind=? AND id=?').get(value.kind, value.id)) throw new Error('A selected item was deleted. Reload collections.');
      return { kind: value.kind, id: value.id };
    });
    if (new Set(members.map(memberKey)).size !== members.length) throw new Error('An item may appear only once in a collection.');
    const tags = input.tags === undefined ? undefined : normalizeTags(input.tags);
    const id = input.id;
    const now = Date.now(), revision = randomUUID();
    db.prepare('INSERT INTO collections VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').run(input.id, input.name.trim(), revision, now, now);
    db.prepare('DELETE FROM collection_members WHERE collection_id=?').run(input.id);
    members.forEach((member, index) => db.prepare('INSERT INTO collection_members VALUES(?,?,?,?)').run(id, member.kind, member.id, index));
    db.prepare('UPDATE collections SET revision=?,updatedAt=? WHERE id=?').run(revision, Math.max(now, Number(row?.updatedAt ?? 0)), input.id);
    if (tags !== undefined) setCollectionTags(db, id, tags);
    const result = collection(db, input.id); db.exec('COMMIT'); return result;
  } finally { db.close(); }
}
