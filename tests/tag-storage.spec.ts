import { test, expect } from './fixtures';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { headers, note, post, library, seed, assign } from './helpers/tags';

test('shared tags normalize, reject invalid writes and protect all record revisions', async ({ request }) => {
  const { image, pdf } = await seed(request);
  let state = await library(request);
  expect(state.vocabulary).toEqual([{ key: 'color', label: 'Color', count: 1 }, { key: 'design', label: 'Design', count: 1 }]);
  const imageRecord = state.records.find(r => r.kind === 'images')!;
  const changed = await (await assign(request, imageRecord, [' design ', 'DESIGN', 'Café', 'café'])).json();
  expect(changed.tags).toEqual([{ key: 'café', label: 'café' }, { key: 'design', label: 'Design' }]);
  expect(changed.revision).not.toBe(image.revision);
  expect((await assign(request, imageRecord, [])).status()).toBe(400);
  expect((await post(request, 'images', { action: 'update', id: image.id, expectedRevision: image.revision, fields: { title: 'stale', source: '', description: '' } })).status()).toBe(400);
  for (const tags of [null, {}, 'design', [''], ['  '], [42], ['x'.repeat(1001)], Array(501).fill('x')]) expect((await assign(request, changed, tags)).status()).toBe(400);
  expect((await assign(request, { ...changed, id: 'missing' }, ['Design'])).status()).toBe(400);
  expect((await post(request, 'tags', { kind: 'fonts', id: image.id, expectedRevision: image.revision, tags: [] })).status()).toBe(400);
  expect((await request.post('/api/library?kind=tags', { data: { ...changed, tags: [] } })).status()).toBe(403);
  expect((await request.get('/api/library?kind=tags', { headers: { Origin: 'https://evil.example' } })).status()).toBe(403);
  const changedNote = await (await assign(request, state.records.find(r => r.kind === 'notes')!, ['Design', 'Type'])).json();
  expect((await post(request, 'notes', { action: 'write', note: { ...note, revision: 'stale-editor' }, id: note.id, expectedRevision: note.revision })).status()).toBe(400);
  expect(await (await post(request, 'notes', { action: 'import', record: note })).json()).toBe('already imported');
  expect((await (await request.get('/api/library?kind=notes')).json())[0].tags).toEqual(['Design', 'Type']);
  const pdfRecord = state.records.find(r => r.kind === 'pdfs')!;
  const changedPdf = await (await assign(request, pdfRecord, ['DESIGN'])).json();
  expect((await post(request, 'pdfs', { action: 'delete', id: pdf.id, revision: pdf.revision })).status()).toBe(400);
  expect((await request.get(`/api/pdfs/${pdf.id}`)).ok()).toBe(true);
  expect((await assign(request, changed, [])).ok()).toBe(true);
  state = await library(request);
  expect(state.records.find(r => r.kind === 'images')!.tags).toEqual([]);
  expect(state.vocabulary.find(t => t.key === 'design')!.count).toBe(2);
  expect((await post(request, 'notes', { action: 'write', note: { ...note, tags: ['New'], revision: 'note-v3' }, id: note.id, expectedRevision: changedNote.revision })).ok()).toBe(true);
  expect((await library(request)).records.find(r => r.kind === 'notes')!.tags).toEqual([{ key: 'new', label: 'New' }]);
  expect((await post(request, 'pdfs', { action: 'delete', id: pdf.id, revision: changedPdf.revision })).ok()).toBe(true);
  expect((await library(request)).vocabulary.find(t => t.key === 'design')!.count).toBe(0);
});

test('tag assignments survive backup and cascade on deletion independently of explicit image links', async ({ request }) => {
  const { image } = await seed(request);
  let state = await library(request);
  const changedImage = await (await assign(request, state.records.find(r => r.kind === 'images')!, ['Color'])).json();
  expect((await request.post('/api/image-links', { headers, data: { action: 'link', noteId: note.id, imageId: image.id, noteRevision: note.revision, imageRevision: changedImage.revision } })).ok()).toBe(true);
  state = await library(request);
  const root = mkdtempSync('/tmp/wayoffmars-test-tags-backup-'), backup = join(root, 'backup'), restored = join(root, 'restored');
  execFileSync(process.execPath, ['scripts/library-backup.mjs', 'backup', backup], { env: { ...process.env, WAYOFFMARS_DATA_DIR: process.env.WAYOFFMARS_TEST_DATA_DIR! } });
  execFileSync(process.execPath, ['scripts/library-backup.mjs', 'restore', backup, restored]);
  const script = `import {openLibrary} from './src/lib/server/database.mjs';const db=openLibrary(process.argv[1]);console.log(JSON.stringify([db.prepare('SELECT * FROM record_tags ORDER BY kind,tag_key').all(),db.prepare('SELECT * FROM tags ORDER BY key').all(),db.prepare('PRAGMA foreign_key_check').all()]));db.close();`;
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script, restored], { encoding: 'utf8' }));
  expect(result[0]).toHaveLength(3); expect(result[1]).toHaveLength(2); expect(result[2]).toEqual([]);
  const changedNote = await (await assign(request, state.records.find(r => r.kind === 'notes')!, [])).json();
  expect(await (await request.get('/api/image-links')).json()).toHaveLength(1);
  expect((await post(request, 'notes', { action: 'write', note: null, id: note.id, expectedRevision: changedNote.revision })).ok()).toBe(true);
  expect(await (await request.get('/api/image-links')).json()).toEqual([]);
  expect((await library(request)).vocabulary.find(t => t.key === 'color')!.count).toBe(1);
  expect((await post(request, 'images', { action: 'delete', id: image.id, expectedRevision: changedImage.revision })).ok()).toBe(true);
  expect((await library(request)).vocabulary.every(t => t.count === 0)).toBe(true);
});

test('v3 migration preserves note labels, receipts and links; repeated opens and legacy imports are idempotent', async () => {
  const root = mkdtempSync('/tmp/wayoffmars-test-tags-v3-');
  const script = `import {DatabaseSync} from 'node:sqlite';import {execFileSync} from 'node:child_process';import {openLibrary} from './src/lib/server/database.mjs';
    let db=new DatabaseSync(process.argv[1]+'/library.sqlite');
    db.exec("CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,asset TEXT,PRIMARY KEY(kind,id)) STRICT;CREATE TABLE imports(kind TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(kind,id,fingerprint)) STRICT;CREATE TABLE image_links(note_kind TEXT NOT NULL DEFAULT 'notes',note_id TEXT NOT NULL,image_kind TEXT NOT NULL DEFAULT 'images',image_id TEXT NOT NULL,PRIMARY KEY(note_id,image_id),FOREIGN KEY(note_kind,note_id) REFERENCES records(kind,id) ON DELETE CASCADE,FOREIGN KEY(image_kind,image_id) REFERENCES records(kind,id) ON DELETE CASCADE) STRICT;PRAGMA user_version=3;");
    db.prepare('INSERT INTO records VALUES(?,?,?,NULL)').run('notes','old',JSON.stringify({tags:[' Design ','DESIGN','Café','café','Color']}));
    db.prepare('INSERT INTO records VALUES(?,?,?,NULL)').run('notes','broken','{broken');
    db.prepare('INSERT INTO records VALUES(?,?,?,NULL)').run('images','image','{}');
    db.exec("INSERT INTO image_links(note_id,image_id) VALUES('old','image');INSERT INTO imports VALUES('notes','old','receipt');");
    const before=db.prepare('SELECT * FROM records ORDER BY kind,id').all();db.close();
    execFileSync(process.execPath,['scripts/library-backup.mjs','backup',process.argv[1]+'/old-backup'],{env:{...process.env,WAYOFFMARS_DATA_DIR:process.argv[1]}});
    execFileSync(process.execPath,['scripts/library-backup.mjs','restore',process.argv[1]+'/old-backup',process.argv[1]+'/restored']);
    db=openLibrary(process.argv[1]+'/restored');if(db.prepare('SELECT COUNT(*) AS n FROM record_tags').get().n!==3)throw new Error('Legacy backup lost tags');db.close();
    for(let i=0;i<3;i++){db=openLibrary(process.argv[1]);db.close();}
    db=openLibrary(process.argv[1]);console.log(JSON.stringify([db.prepare('PRAGMA user_version').get().user_version,JSON.stringify(before)===JSON.stringify(db.prepare('SELECT * FROM records ORDER BY kind,id').all()),db.prepare('SELECT * FROM record_tags ORDER BY tag_key').all(),db.prepare('SELECT label FROM tags ORDER BY key').all(),db.prepare('SELECT fingerprint FROM imports').get().fingerprint,db.prepare('SELECT COUNT(*) AS n FROM image_links').get().n,db.prepare('PRAGMA foreign_key_check').all()]));db.close();`;
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script, root], { encoding: 'utf8' }));
  expect(result).toEqual([4, true, ['café', 'color', 'design'].map(tag_key => ({ kind: 'notes', record_id: 'old', tag_key })), [{ label: 'Café' }, { label: 'Color' }, { label: 'Design' }], 'receipt', 1, []]);
});
