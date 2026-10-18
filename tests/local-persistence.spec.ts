import { test, expect } from './fixtures';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const note = { id: 'legacy-note', revision: 'original', title: 'Legacy grid', body: 'A generous baseline grid', tags: ['layout'], source: '', createdAt: 1, updatedAt: 1 };
const pdf = { id: 'b'.repeat(64), filename: 'Legacy.pdf', byteSize: 100, importedAt: 1, revision: 'legacy', pages: [{ number: 1, text: 'Legacy searchable PDF' }] };
const fontBytes = readFileSync('tests/fixtures/fonts/SourceSerif4-Regular.ttf');
const font = { id: createHash('sha256').update(fontBytes).digest('hex'), name: 'Legacy.ttf', size: fontBytes.length, addedAt: 1, bytes: fontBytes.toString('base64') };
const headers = { Origin: 'http://127.0.0.1:3107', 'X-Wayoffmars': '1' };

test('explicit browser import preserves originals, verifies binaries, resumes after a lost response and skips conflicts', async ({ page }) => {
  await page.goto('/library');
  await page.evaluate(async ({ note, pdf, font }) => {
    for (const [kind, records] of [['notes', [note, { ...note, id: 'conflict' }, { id: 'broken' }]], ['pdfs', [pdf]], ['fonts', [{ ...font, bytes: Uint8Array.from(atob(font.bytes), c => c.charCodeAt(0)).buffer }]]] as const) {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(`wayoffmars-${kind}`, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(kind, { keyPath: 'id' });
        open.onsuccess = () => { const db = open.result, tx = db.transaction(kind, 'readwrite'); for (const record of records) tx.objectStore(kind).put(record); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); };
      });
    }
  }, { note, pdf, font });
  expect(await (await page.request.get('/api/library?kind=notes')).json()).toEqual([]);
  await page.request.post('/api/library?kind=notes', { headers, data: { action: 'write', id: 'conflict', expectedRevision: null, note: { ...note, id: 'conflict', body: 'Keep SQLite version' } } });
  let lost = false;
  await page.route('**/api/library?kind=notes', async route => {
    if (!lost && route.request().method() === 'POST' && route.request().postDataJSON().record?.id === note.id) {
      lost = true; await route.fetch(); await route.abort();
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Import browser library' }).click();
  await expect(page.getByLabel('Import report')).toContainText('Import finished');
  await expect(page.getByLabel('Import report')).toContainText('conflict');
  await expect(page.getByLabel('Import report')).toContainText('failed');
  await page.getByRole('button', { name: 'Import browser library' }).click();
  await expect(page.getByLabel('Import report')).toContainText('already imported');
  await expect(page.getByLabel('Import report')).toContainText('Import finished');
  const records = await (await page.request.get('/api/library?kind=notes')).json();
  expect(records).toHaveLength(2); expect(records.find((r: { id: string }) => r.id === 'conflict').body).toBe('Keep SQLite version');
  expect(await (await page.request.get(`/api/library?kind=asset&id=${font.id}`)).json()).toBe(font.bytes);
  await page.request.post('/api/library?kind=notes', { headers, data: { action: 'write', note: null, id: note.id, expectedRevision: note.revision } });
  await page.getByRole('button', { name: 'Import browser library' }).click();
  await expect(page.getByLabel('Import report')).toContainText('Import finished');
  expect(await (await page.request.get('/api/library?kind=notes')).json()).toHaveLength(1);
  const counts = await page.evaluate(async () => Promise.all(['notes','pdfs','fonts'].map(kind => new Promise<number>(resolve => {
    const open = indexedDB.open(`wayoffmars-${kind}`, 1); open.onsuccess = () => { const db = open.result, tx = db.transaction(kind), count = tx.objectStore(kind).count(); tx.oncomplete = () => { db.close(); resolve(count.result); }; };
  }))));
  expect(counts).toEqual([3, 1, 1]);
  await page.screenshot({ path: '/tmp/wayoffmars-legacy-import.png', fullPage: true });
  await page.goto('/notes'); await page.getByRole('searchbox').fill('searchable');
  await expect(page.getByRole('article', { name: 'Legacy.pdf' })).toContainText('Page 1');
});

test('request guard rejects foreign Host, Origin, simple mutations and malformed records', async ({ request }) => {
  for (const badHeaders of [{ Host: 'evil.example' }, { Origin: 'https://evil.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    expect((await request.get('/api/library?kind=notes', { headers: badHeaders as unknown as Record<string, string> })).status()).toBe(403);
  }
  for (const badHeaders of [{}, { Origin: headers.Origin }, { ...headers, Origin: 'http://localhost:3107' }]) {
    expect((await request.post('/api/library?kind=notes', { headers: badHeaders as unknown as Record<string, string>, data: { action: 'write', note, id: note.id, expectedRevision: null } })).status()).toBe(403);
  }
  for (const [kind, data] of [['notes', { action: 'write', note: { ...note, source: 'javascript:alert(1)' }, id: note.id }], ['fonts', { action: 'save', font: { ...font, id: '../bad' } }], ['pdfs', { action: 'save', pdf: { ...pdf, pages: [{ number: 2, text: 'wrong' }] } }]]) {
    expect((await request.post(`/api/library?kind=${kind}`, { headers, data })).status()).toBe(400);
  }
  expect((await request.get('/api/library?kind=asset&id=../../package.json')).status()).toBe(400);
  expect(await (await request.get('/api/library?kind=notes')).json()).toEqual([]);
});

test('committed records survive a fresh process; backup and restore verify database and asset bytes', async ({ request }) => {
  for (const [kind, record] of [['notes', note], ['pdfs', pdf], ['fonts', font]]) {
    expect((await request.post(`/api/library?kind=${kind}`, { headers, data: { action: 'import', record } })).ok()).toBe(true);
  }
  const directory = process.env.WAYOFFMARS_TEST_DATA_DIR!;
  const code = `const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(process.argv[1],{readOnly:true}); process.stdout.write(String(db.prepare('SELECT COUNT(*) AS count FROM records').get().count)); db.close();`;
  expect(execFileSync(process.execPath, ['-e', code, join(directory, 'library.sqlite')], { encoding: 'utf8' }).trim()).toBe('3');
  const root = mkdtempSync('/tmp/wayoffmars-test-backup-'), backup = join(root, 'backup'), restored = join(root, 'restored');
  execFileSync(process.execPath, ['scripts/library-backup.mjs', 'backup', backup], { env: { ...process.env, WAYOFFMARS_DATA_DIR: directory } });
  execFileSync(process.execPath, ['scripts/library-backup.mjs', 'restore', backup, restored]);
  expect(readFileSync(join(restored, 'assets', font.id))).toEqual(fontBytes);
  expect(execFileSync(process.execPath, ['-e', code, join(restored, 'library.sqlite')], { encoding: 'utf8' }).trim()).toBe('3');
  writeFileSync(join(backup, 'assets', font.id), 'broken');
  expect(() => execFileSync(process.execPath, ['scripts/library-backup.mjs', 'restore', backup, join(root, 'bad')], { stdio: 'pipe' })).toThrow();
});

test('SQLite abort rolls back records and receipts; retry safely reuses verified asset bytes', async ({ request }) => {
  const run = (sql: string) => execFileSync(process.execPath, ['-e', `const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(process.argv[1]); db.exec(process.argv[2]); db.close();`, join(process.env.WAYOFFMARS_TEST_DATA_DIR!, 'library.sqlite'), sql], { stdio: 'pipe' });
  run("CREATE TRIGGER reject_record BEFORE INSERT ON records BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END;");
  expect((await request.post('/api/library?kind=fonts', { headers, data: { action: 'import', record: font } })).status()).toBe(400);
  expect(await (await request.get('/api/library?kind=fonts')).json()).toEqual([]);
  run('DROP TRIGGER reject_record;');
  const retry = await request.post('/api/library?kind=fonts', { headers, data: { action: 'import', record: font } });
  expect(await retry.json()).toBe('imported and verified');
  expect(await (await request.get(`/api/library?kind=asset&id=${font.id}`)).json()).toBe(font.bytes);
});
