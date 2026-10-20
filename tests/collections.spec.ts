import { test, expect } from './fixtures';
import { seed, post, note } from './helpers/tags';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import type { CollectionsLibrary } from '../src/lib/collection-model';

test('ordered collections keep sources, reject stale/invalid writes and cascade source deletion', async ({ request }) => {
  const { image, pdf } = await seed(request), id = randomUUID();
  const members = [{ kind: 'notes', id: note.id }, { kind: 'images', id: image.id }, { kind: 'pdfs', id: pdf.id }];
  const initial = { action: 'save', id, expectedRevision: null, name: 'Project', members };
  const saved = await (await post(request, 'collections', initial)).json();
  expect(saved.members).toEqual(members);
  expect((await post(request, 'collections', initial)).status()).toBe(400);
  for (const changes of [{ name: '' }, { members: [...members, members[0]] }, { members: [{ kind: 'images', id: 'missing' }] }, { members: Array(101).fill(members[0]) }]) {
    expect((await post(request, 'collections', { ...initial, expectedRevision: saved.revision, ...changes })).status()).toBe(400);
  }
  expect((await request.post('/api/library?kind=collections', { data: initial })).status()).toBe(403);
  const reordered = await (await post(request, 'collections', { ...initial, expectedRevision: saved.revision, members: [...members].reverse() })).json();
  expect(reordered.members).toEqual([...members].reverse());
  await post(request, 'images', { action: 'delete', id: image.id, expectedRevision: image.revision });
  const state: CollectionsLibrary = await (await request.get('/api/library?kind=collections')).json();
  expect(state.collections[0].members).toEqual([members[2], members[0]]);
  expect((await post(request, 'collections', { ...initial, expectedRevision: reordered.revision })).status()).toBe(400);
  expect((await post(request, 'collections', { action: 'delete', id, expectedRevision: state.collections[0].revision })).ok()).toBe(true);
  expect(await (await request.get('/api/library?kind=notes')).json()).toHaveLength(1);
  expect(await (await request.get('/api/library?kind=pdfs')).json()).toHaveLength(1);
});

test('collections create, reorder, remove membership and navigate on desktop/mobile with keyboard', async ({ page, request }) => {
  await seed(request);
  const bytes = readFileSync('tests/fixtures/fonts/SourceSerif4-Regular.ttf');
  expect((await post(request, 'fonts', { action: 'save', font: { id: createHash('sha256').update(bytes).digest('hex'), name: 'SourceSerif4-Regular.ttf', size: bytes.length, bytes: bytes.toString('base64'), addedAt: 1 } })).ok()).toBe(true);
  await page.goto('/collections');
  await page.getByRole('button', { name: 'New collection', exact: true }).click();
  await page.getByLabel('New collection name').fill('Type project');
  await page.getByRole('button', { name: 'Create collection' }).click();
  await expect(page.getByRole('heading', { name: 'Type project' })).toBeFocused();
  await page.getByRole('button', { name: 'Edit collection', exact: true }).click();
  await page.getByLabel('Collection name', { exact: true }).fill('Discard this');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Reload collections' }).click();
  await expect(page.getByLabel('Collection name', { exact: true })).toHaveValue('Type project');
  for (const label of ['notes · Color study', 'images · Palette.png', 'pdfs · Design.pdf', 'fonts · SourceSerif4-Regular.ttf']) {
    await page.getByLabel('Item to add').selectOption({ label });
    await page.getByRole('button', { name: 'Add to collection' }).click();
    await expect(page.getByRole('heading', { name: 'Type project' })).toBeFocused();
  }
  await page.getByRole('button', { name: 'New collection', exact: true }).click();
  await page.getByLabel('New collection name').fill('Next project draft');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Move Design.pdf up' }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('article').nth(1)).toHaveAttribute('aria-label', 'Design.pdf');
  await page.getByRole('button', { name: 'New collection', exact: true }).click();
  await expect(page.getByLabel('New collection name')).toHaveValue('Next project draft');
  await page.getByLabel('New collection name').fill('');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Remove Palette.png from collection' }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.locator('.font-sample')).toBeVisible();
  expect(await (await request.get('/api/library?kind=images')).json()).toHaveLength(1);
  await page.screenshot({ path: '/tmp/wayoffmars-collections-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/wayoffmars-collections-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Color study' }).click();
  await expect(page.getByRole('article', { name: 'Color study' })).toBeInViewport();
});

test('schema4 migrates transactionally and ordered references survive verified backup restore', async ({ request }) => {
  await seed(request);
  const root = mkdtempSync('/tmp/wayoffmars-test-collections-');
  const oldScript = `import {openLibrary} from './src/lib/server/database.mjs'; let db=openLibrary(process.argv[1]); db.exec("DROP TABLE collection_tags;DROP TABLE pdf_excerpts;DROP TABLE collection_members;DROP TABLE collections;PRAGMA user_version=4;INSERT INTO records VALUES('notes','legacy','{}',NULL);INSERT INTO imports VALUES('notes','legacy','receipt');");db.close();db=openLibrary(process.argv[1]);console.log(JSON.stringify([db.prepare('PRAGMA user_version').get().user_version,db.prepare('SELECT id FROM records').get().id,db.prepare('SELECT fingerprint FROM imports').get().fingerprint,db.prepare('PRAGMA foreign_key_check').all()]));db.close();`;
  const migrated = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', oldScript, root + '/old'], { encoding: 'utf8' }));
  expect(migrated).toEqual([7, 'legacy', 'receipt', []]);
  const state: CollectionsLibrary = await (await request.get('/api/library?kind=collections')).json();
  const collection = await (await post(request, 'collections', { action: 'save', id: randomUUID(), expectedRevision: null, name: 'Backup project', members: state.items.map(({ kind, id }) => ({ kind, id })) })).json();
  execFileSync(process.execPath, ['scripts/library-backup.mjs', 'backup', root + '/backup'], { env: { ...process.env, WAYOFFMARS_DATA_DIR: process.env.WAYOFFMARS_TEST_DATA_DIR! } });
  execFileSync(process.execPath, ['scripts/library-backup.mjs', 'restore', root + '/backup', root + '/restored']);
  const restored = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import {openLibrary} from './src/lib/server/database.mjs'; const db=openLibrary(process.argv[1]);console.log(JSON.stringify([db.prepare('SELECT * FROM collections').get(), db.prepare('SELECT kind,record_id AS id FROM collection_members ORDER BY position').all(),db.prepare('PRAGMA foreign_key_check').all()]));db.close();`, root + '/restored'], { encoding: 'utf8' }));
  expect(restored[0].revision).toBe(collection.revision); expect(restored[1]).toEqual(collection.members); expect(restored[2]).toEqual([]);
});
