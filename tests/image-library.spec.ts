import { test, expect, failStorage } from './fixtures';
import sharp from 'sharp';
import { animatedPng } from './helpers/image';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const headers = { Origin: 'http://127.0.0.1:3107', 'X-Wayoffmars': '1' };
const picture = (format: 'png' | 'jpeg' | 'webp' = 'png', width = 32, height = 24) => sharp({ create: { width, height, channels: 3, background: '#d22a58' } })[format]().toBuffer();

test('gallery imports all formats, preserves bytes, skips renamed copies and edits details on mobile', async ({ page, request }) => {
  await page.goto('/images');
  for (const format of ['png','jpeg','webp'] as const) {
    const buffer = await picture(format);
    await page.getByLabel('Choose image').setInputFiles({ name: `Reference.${format}`, mimeType: 'application/octet-stream', buffer });
    await expect(page.getByRole('status').first()).toContainText('saved on this Mac');
    const id = createHash('sha256').update(buffer).digest('hex');
    const response = await request.get(`/api/images/${id}`);
    expect(response.headers()['content-type']).toBe(`image/${format}`);
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(await response.body()).toEqual(buffer);
  }
  await page.getByLabel('Choose image').setInputFiles({ name: 'renamed.png', mimeType: 'image/png', buffer: await picture() });
  await expect(page.getByRole('status').first()).toContainText('already saved');
  expect(await (await request.get('/api/library?kind=images')).json()).toHaveLength(3);
  await page.getByRole('button', { name: 'Open Reference.png', exact: true }).click();
  await page.getByLabel('Image title').fill('Red reference');
  await page.getByLabel('Source URL').fill('https://example.com/reference');
  await page.getByLabel('Why saved').fill('A bold color for a quiet layout.');
  await page.getByRole('button', { name: 'Save image details' }).click();
  await expect(page.getByRole('status').first()).toHaveText('Image details saved on this Mac.');
  await page.reload();
  await expect(page.getByLabel('Image title')).toHaveValue('Red reference');
  await expect(page.getByLabel('Why saved')).toHaveValue('A bold color for a quiet layout.');
  await expect.poll(() => page.getByRole('region', { name: 'Image details' }).getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(32);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/wayoffmars-images-mobile.png', fullPage: true });
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete image', exact: true }).click();
  await expect(page.getByLabel('Image title')).toHaveValue('Red reference');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete image', exact: true }).click();
  await expect(page.getByRole('status').first()).toHaveText('Image deleted.');
  expect(await (await request.get('/api/library?kind=images')).json()).toHaveLength(2);
});

test('server rejects malformed, active, oversized, animated inputs and stale metadata/deletes', async ({ request }) => {
  const valid = await picture();
  const oversized = await picture('png', 12001, 1);
  const tooManyPixels = await picture('png', 5000, 5000);
  const frames = Buffer.concat([Buffer.alloc(12, 0), Buffer.alloc(12, 255)]);
  const animated = await sharp(frames, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp({ loop: 0, delay: [100,100] }).toBuffer();
  expect((await sharp(animated).metadata()).pages).toBe(2);
  for (const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), Buffer.from('<html>active</html>'), valid.subarray(0, 40), oversized, tooManyPixels, animated, animatedPng(), Buffer.alloc(20 * 1024 * 1024 + 1)]) {
    expect((await request.post('/api/library?kind=images', { headers, data: { action: 'save', filename: 'fake.png', bytes: bytes.toString('base64') } })).status()).toBe(400);
  }
  const result = await (await request.post('/api/library?kind=images', { headers, data: { action: 'save', filename: 'valid.png', bytes: valid.toString('base64') } })).json();
  const change = { id: result.image.id, expectedRevision: result.image.revision, fields: { title: 'Changed', source: '', description: '' } };
  expect((await request.post('/api/library?kind=images', { headers, data: { action: 'update', ...change, fields: { ...change.fields, source: 'javascript:alert(1)' } } })).status()).toBe(400);
  expect((await request.post('/api/library?kind=images', { headers, data: { action: 'update', ...change } })).ok()).toBe(true);
  for (const action of ['update','delete']) expect((await request.post('/api/library?kind=images', { headers, data: { action, ...change } })).status()).toBe(400);
  expect((await request.get(`/api/images/${result.image.id}`, { headers: { Origin: 'https://evil.example' } })).status()).toBe(403);
});

test('failed imports retry and missing image previews report recovery without removing metadata', async ({ page, request }) => {
  await failStorage(page, 'images', 'save');
  await page.goto('/images');
  const buffer = await picture();
  await page.getByLabel('Choose image').setInputFiles({ name: 'Retry.png', mimeType: 'image/png', buffer });
  await expect(page.getByRole('region', { name: 'Image library', exact: true }).getByRole('alert')).toContainText('could not be imported');
  await page.evaluate(() => sessionStorage.setItem('allowSave', '1'));
  await page.getByLabel('Choose image').setInputFiles({ name: 'Retry.png', mimeType: 'image/png', buffer });
  await expect(page.getByRole('status').first()).toContainText('saved on this Mac');
  const [record] = await (await request.get('/api/library?kind=images')).json();
  writeFileSync(join(process.env.WAYOFFMARS_TEST_DATA_DIR!, 'assets', record.id), 'damaged');
  await page.reload(); await page.getByRole('button', { name: 'Open Retry.png' }).click();
  await expect(page.getByRole('region', { name: 'Image details' }).getByRole('alert')).toContainText('missing or damaged');
  expect(await (await request.get('/api/library?kind=images')).json()).toHaveLength(1);
});

test('v1 migration preserves records and receipts; images survive fresh-process reads and backup restore', async ({ request }) => {
  const root = mkdtempSync('/tmp/wayoffmars-test-image-backup-'), old = join(root, 'old');
  const migrate = `import {DatabaseSync} from 'node:sqlite'; import {mkdirSync} from 'node:fs'; import {openLibrary} from './src/lib/server/database.mjs'; mkdirSync(process.argv[1]); let db=new DatabaseSync(process.argv[1]+'/library.sqlite'); db.exec("CREATE TABLE records(kind TEXT NOT NULL CHECK(kind IN ('notes','pdfs','fonts')),id TEXT NOT NULL,data TEXT NOT NULL,asset TEXT,PRIMARY KEY(kind,id)) STRICT; CREATE TABLE imports(kind TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(kind,id,fingerprint)) STRICT; INSERT INTO records VALUES('notes','old','{}',NULL); INSERT INTO imports VALUES('notes','old','receipt'); PRAGMA user_version=1;");db.close();db=openLibrary(process.argv[1]); console.log(JSON.stringify([db.prepare('SELECT * FROM records').all(),db.prepare('SELECT * FROM imports').all(),db.prepare('PRAGMA user_version').get()])); db.close();`;
  const migrated = JSON.parse(execFileSync(process.execPath, ['--input-type=module','-e', migrate, old], { encoding: 'utf8' }));
  expect(migrated[0][0].id).toBe('old'); expect(migrated[1][0].fingerprint).toBe('receipt'); expect(migrated[2].user_version).toBeGreaterThanOrEqual(2);
  const bytes = await picture('webp');
  const { image } = await (await request.post('/api/library?kind=images', { headers, data: { action: 'save', filename: 'Backup.webp', bytes: bytes.toString('base64') } })).json();
  const directory = process.env.WAYOFFMARS_TEST_DATA_DIR!, backup = join(root, 'backup'), restored = join(root, 'restored');
  execFileSync(process.execPath, ['scripts/library-backup.mjs','backup',backup], { env: { ...process.env, WAYOFFMARS_DATA_DIR: directory } });
  execFileSync(process.execPath, ['scripts/library-backup.mjs','restore',backup,restored]);
  expect(readFileSync(join(restored,'assets',image.id))).toEqual(bytes);
  const read = `import {openLibrary} from './src/lib/server/database.mjs';const db=openLibrary(process.argv[1]); console.log(db.prepare("SELECT data FROM records WHERE kind='images'").get().data);db.close();`;
  expect(JSON.parse(execFileSync(process.execPath, ['--input-type=module','-e',read,restored], { encoding: 'utf8' }))).toEqual(image);
});
