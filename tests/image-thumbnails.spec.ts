import { test, expect } from './fixtures';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const headers = { Origin: 'http://127.0.0.1:3107', 'X-Wayoffmars': '1' };
const directory = () => {
  const value = process.env.WAYOFFMARS_TEST_DATA_DIR;
  if (!value?.startsWith('/tmp/wayoffmars-test-')) throw new Error('Isolated library required.');
  return value;
};
const picture = () => sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#d22a58' } }).jpeg().toBuffer();
// Existing schema-6 records need no new fields or import to acquire previews.
function seed(bytes: Buffer, count = 1) {
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import {openLibrary,storeAsset,digest} from './src/lib/server/database.mjs';
    import {readFileSync} from 'node:fs';
    const source=Buffer.from(readFileSync(0,'utf8'),'base64'),directory=process.argv[1],db=openLibrary(directory),records=[];
    db.exec('BEGIN');
    for(let i=0;i<Number(process.argv[2]);i++) {
      const bytes=Buffer.concat([source,Buffer.from('variant-'+i)]),id=digest(bytes);
      const image={id,title:'Existing '+i,filename:'reference.jpg',description:'',source:'',format:'jpeg',width:2400,height:1600,byteSize:bytes.length,revision:'r'+i,createdAt:i,updatedAt:i};
      storeAsset(directory,id,bytes);db.prepare("INSERT INTO records VALUES('images',?,?,?)").run(id,JSON.stringify(image),id);records.push(image);
    }
    db.exec('COMMIT');db.close();console.log(JSON.stringify(records));`, directory(), String(count)], { input: bytes.toString('base64'), encoding: 'utf8' })) as { id: string; title: string; revision: string }[];
}

test('fresh thumbnails preserve alpha, respect orientation and bounds, and leave original downloads intact', async ({ request }) => {
  const transparent = await sharp({ create: { width: 24, height: 16, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.4 } } }).png().toBuffer();
  const rotated = await sharp(await picture()).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  for (const [filename, bytes] of [['Transparent.png', transparent], ['Rotated.jpg', rotated]] as const) {
    const saved = await request.post('/api/library?kind=images', { headers, data: { action: 'save', filename, bytes: bytes.toString('base64') } });
    expect(saved.ok()).toBe(true);
    const id = createHash('sha256').update(bytes).digest('hex');
    const responses = await Promise.all(Array.from({ length: 4 }, () => request.get(`/api/images/${id}/thumbnail`)));
    expect(responses.every(r => r.ok())).toBe(true);
    const thumbnail = await responses[0].body(), metadata = await sharp(thumbnail).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeLessThanOrEqual(640); expect(metadata.height).toBeLessThanOrEqual(440);
    if (filename.endsWith('.png')) { expect(metadata.hasAlpha).toBe(true); expect([metadata.width, metadata.height]).toEqual([24, 16]); }
    else { expect(metadata.width).toBeLessThan(metadata.height!); expect(metadata.height).toBe(440); }
    for (const response of responses) expect(await response.body()).toEqual(thumbnail);
    expect(responses[0].headers()['cache-control']).toBe('no-store');
    expect(responses[0].headers()['x-content-type-options']).toBe('nosniff');
    expect(await (await request.get(`/api/images/${id}`)).body()).toEqual(bytes);
    expect((await request.get(`/api/images/${id}/thumbnail`, { headers: { Origin: 'https://evil.example' } })).status()).toBe(403);
  }
});

test('existing images generate previews; warm caches never hide missing, damaged or deleted originals', async ({ request }) => {
  const [image] = seed(await picture()), path = join(directory(), 'assets', image.id), original = readFileSync(path);
  const url = `/api/images/${image.id}/thumbnail`;
  const response = await request.get(url); expect(response.ok()).toBe(true);
  const thumbnail = await response.body();
  writeFileSync(path, 'damaged'); expect((await request.get(url)).status()).toBe(404);
  writeFileSync(path, original); expect(await (await request.get(url)).body()).toEqual(thumbnail);
  unlinkSync(path); expect((await request.get(url)).status()).toBe(404);
  writeFileSync(path, original); expect((await request.get(url)).ok()).toBe(true);
  expect((await request.post('/api/library?kind=images', { headers, data: { action: 'delete', id: image.id, expectedRevision: image.revision } })).ok()).toBe(true);
  expect((await request.get(url)).status()).toBe(404);
});

test('gallery requests thumbnails near the viewport and opens original detail on desktop and mobile', async ({ page }) => {
  seed(await picture(), 80);
  const urls: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/images/')) urls.push(r.url()); });
  await page.goto('/images');
  await expect(page.locator('.image-gallery img')).toHaveCount(80);
  await expect.poll(() => page.locator('.image-gallery img').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(urls.length).toBeLessThan(80);
  expect(urls.every(url => url.includes('/thumbnail?'))).toBe(true);
  const last = page.locator('.image-gallery img').last();
  await last.scrollIntoViewIfNeeded();
  await expect.poll(() => last.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(640);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open Existing 0', exact: true }).click();
  const original = page.getByRole('region', { name: 'Image details' }).getByRole('img');
  await expect.poll(() => original.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2400);
  expect(await original.getAttribute('src')).not.toContain('/thumbnail');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('failed thumbnail requests can retry without losing the image or blocking its original', async ({ page }) => {
  seed(await picture());
  let fail = true;
  await page.route('**/api/images/*/thumbnail?*', route => fail ? route.fulfill({ status: 503, body: 'Temporary preview failure' }) : route.continue());
  await page.goto('/images');
  await expect(page.locator('.image-gallery').getByRole('alert')).toContainText('Preview could not be loaded');
  fail = false;
  await page.getByRole('button', { name: 'Retry preview' }).click();
  await expect.poll(() => page.locator('.image-gallery img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(640);
  await expect(page.locator('.image-gallery').getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Existing 0', exact: true }).click();
  await expect.poll(() => page.getByRole('region', { name: 'Image details' }).getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2400);
});

test('backup and restore retain only original assets and restored records can regenerate thumbnails', async ({ request }) => {
  const [image] = seed(await picture());
  expect((await request.get(`/api/images/${image.id}/thumbnail`)).ok()).toBe(true);
  const root = mkdtempSync('/tmp/wayoffmars-test-thumbnail-backup-'), backup = join(root, 'backup'), restored = join(root, 'restored');
  execFileSync(process.execPath, ['scripts/library-backup.mjs', 'backup', backup], { env: { ...process.env, WAYOFFMARS_DATA_DIR: directory() } });
  execFileSync(process.execPath, ['scripts/library-backup.mjs', 'restore', backup, restored]);
  expect(readdirSync(join(restored, 'assets'))).toEqual([image.id]);
  expect(readFileSync(join(restored, 'assets', image.id))).toEqual(readFileSync(join(directory(), 'assets', image.id)));
  // Run the actual thumbnail implementation in a fresh process/cache against the restore.
  // A private transpilation loader supplies only Node's otherwise-browser-blocked marker.
  const script = `
    const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
    const load=Module._load;Module._load=function(id,...args){return id==='server-only'?{}:load.call(this,id,...args)};
    require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
    require('./src/lib/server/image-thumbnails.ts').imageThumbnail(process.argv[1]).then(b=>console.log(b.toString('base64')));
  `;
  const bytes = Buffer.from(execFileSync(process.execPath, ['-e', script, image.id], { env: { ...process.env, WAYOFFMARS_DATA_DIR: restored }, encoding: 'utf8' }).trim(), 'base64');
  expect((await sharp(bytes).metadata()).width).toBe(640);
});
