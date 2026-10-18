import { test, expect, type Page } from './fixtures';
import { makePdf, textPage, imagePage } from './helpers/pdf';
import { createHash } from 'node:crypto';
import { unlinkSync, readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const bytes = makePdf([textPage('FIRST physical page'), imagePage, textPage('THIRD physical page with kerning')]);
const id = createHash('sha256').update(bytes).digest('hex');
const headers = { Origin: 'http://127.0.0.1:3107', 'X-Wayoffmars': '1' };
const legacy = { id, filename: 'Original.pdf', byteSize: bytes.length, revision: 'legacy', importedAt: 1, pages: [{ number: 1, text: 'FIRST physical page' }, { number: 2, text: '' }, { number: 3, text: 'THIRD physical page with kerning' }] };
async function ready(page: Page) { await page.goto('/notes'); await expect(page.getByRole('button', { name: 'Import PDF', exact: true })).toBeEnabled(); }
async function importPdf(page: Page) {
  await ready(page); await page.getByLabel('Choose PDF', { exact: true }).setInputFiles({ name: 'Original.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(page.getByRole('region', { name: 'PDF library' }).getByRole('status')).toContainText('saved on this Mac');
}
async function rendered(page: Page, number: number) {
  await expect(page.locator('canvas')).toHaveAttribute('data-rendered-page', String(number));
  expect(await page.locator('canvas').evaluate(canvas => {
    const c = canvas as HTMLCanvasElement, data = c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;
    let ink = 0; for (let i=0;i<data.length;i+=4) if(data[i]<220 && data[i+1]<220 && data[i+2]<220) ink++;
    return ink;
  })).toBeGreaterThan(20);
}

test('Open page renders the cited original physical page, navigates blank pages and persists through reload', async ({ page, context }) => {
  await importPdf(page);
  expect(readFileSync(join(process.env.WAYOFFMARS_TEST_DATA_DIR!, 'assets', id))).toEqual(bytes);
  await page.getByRole('searchbox').fill('kerning');
  const popup = context.waitForEvent('page'); await page.getByRole('link', { name: 'Open page 3' }).click(); const viewer = await popup;
  const errors: string[] = [], external: string[] = [];
  viewer.on('pageerror', error => errors.push(error.message));
  viewer.on('console', message => { if (['error','warning'].includes(message.type()) && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text()); });
  viewer.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:3107')) external.push(req.url()); });
  await rendered(viewer,3); await expect(viewer).toHaveURL(new RegExp(`/pdf/${id}\\?page=3$`)); await expect(viewer).toHaveTitle('PDF page | wayoffmars');
  await viewer.getByText('Text from this original page', { exact: true }).click();
  await expect(viewer.locator('.pdf-original-text')).toHaveText('THIRD physical page with kerning');
  await expect(viewer.locator('nextjs-portal').getByText('Runtime Error')).toHaveCount(0);
  await viewer.screenshot({ path: '/tmp/wayoffmars-original-page3-desktop.png', fullPage: true });
  await viewer.reload(); await rendered(viewer,3);
  await viewer.getByRole('link', { name: 'Previous page' }).click(); await rendered(viewer,2);
  await viewer.getByText('Text from this original page', { exact: true }).click();
  await expect(viewer.locator('.pdf-original-text')).toContainText('no selectable text');
  await viewer.getByRole('link', { name: 'Previous page' }).click(); await rendered(viewer,1);
  await viewer.getByText('Text from this original page', { exact: true }).click();
  await expect(viewer.locator('.pdf-original-text')).toHaveText('FIRST physical page');
  await viewer.getByRole('spinbutton', { name: 'Physical page' }).fill('3'); await viewer.getByRole('button', { name: 'Go', exact: true }).click(); await rendered(viewer,3);
  await viewer.setViewportSize({ width:390, height:844 });
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await viewer.screenshot({ path:'/tmp/wayoffmars-original-page3-mobile.png',fullPage:true });
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await page.reload(); await page.getByRole('searchbox').fill('kerning'); await expect(page.getByRole('link', { name: 'Open page 3' })).toBeVisible();
});

test('legacy text stays searchable; mismatched original is rejected and matching reattachment survives reload', async ({ page, request }) => {
  await request.post('/api/library?kind=pdfs', { headers, data: { action:'import', record:legacy } });
  await ready(page); await page.getByRole('searchbox').fill('kerning');
  await expect(page.getByText('Text only — reattach the original to open cited pages.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open page 3' })).toHaveCount(0);
  const picker = page.getByLabel('Original PDF for Original.pdf');
  await picker.setInputFiles({ name:'wrong.pdf',mimeType:'application/pdf',buffer:makePdf([textPage('Wrong PDF')]) });
  await expect(page.getByRole('main').getByRole('alert')).toContainText('checksum or page count mismatch');
  expect((await request.get(`/api/pdfs/${id}`)).status()).toBe(404);
  await picker.setInputFiles({ name:'renamed.pdf',mimeType:'application/pdf',buffer:bytes });
  await expect(page.getByText('Original attached and checksum verified.')).toBeVisible();
  await page.reload(); await page.getByRole('searchbox').fill('kerning'); await expect(page.getByRole('link', { name:'Open page 3' })).toBeVisible();
  const record = (await (await request.get('/api/library?kind=pdfs')).json())[0];
  expect(record).toMatchObject({ ...legacy, hasOriginal:true });
  await picker.setInputFiles({ name:'again.pdf',mimeType:'application/pdf',buffer:bytes });
  await expect(page.getByText('Original attached and checksum verified.')).toBeVisible();
  expect(await (await request.get('/api/library?kind=pdfs')).json()).toHaveLength(1);
  await page.goto(`/pdf/${id}?page=3`); await rendered(page,3);
});

test('missing asset has an actionable error and can be repaired without losing searchable text', async ({ page, request }) => {
  await importPdf(page); unlinkSync(join(process.env.WAYOFFMARS_TEST_DATA_DIR!, 'assets', id));
  await page.goto(`/pdf/${id}?page=3`);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('missing or unreadable');
  expect((await (await request.get('/api/library?kind=pdfs')).json())[0].pages).toEqual(legacy.pages);
  await page.getByLabel('Original PDF for Original.pdf').setInputFiles({ name:'Original.pdf',mimeType:'application/pdf',buffer:bytes });
  await rendered(page,3); expect(await (await request.get(`/api/pdfs/${id}`)).body()).toEqual(bytes);
});

test('canceled reattachment saves no original; malformed input and invalid page URLs stay explicit', async ({ page, request }) => {
  await request.post('/api/library?kind=pdfs', { headers, data: { action:'import', record:legacy } }); await ready(page);
  await page.route('**/pdf.worker.min.mjs', route => route.fulfill({ contentType:'text/javascript',body:'// stalled worker' }));
  await page.getByLabel('Original PDF for Original.pdf').setInputFiles({ name:'Original.pdf',mimeType:'application/pdf',buffer:bytes });
  await page.getByRole('button', { name:'Cancel reattachment' }).click();
  await expect(page.getByText('Reattachment canceled. Nothing was associated.')).toBeVisible();
  expect((await request.get(`/api/pdfs/${id}`)).status()).toBe(404);
  await page.getByLabel('Original PDF for Original.pdf').setInputFiles({ name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF') });
  await expect(page.getByRole('main').getByRole('alert')).toContainText('not a valid PDF');
  for (const value of ['0','-1','1.5','garbage','301']) {
    await page.goto(`/pdf/${id}?page=${value}`); await expect(page.getByRole('main').getByRole('alert')).toContainText('Invalid PDF identity or page number'); await expect(page.locator('canvas')).toHaveCount(0);
  }
  await page.goto(`/pdf/${id}?page=4`); await expect(page.getByRole('main').getByRole('alert')).toContainText('does not exist');
});

test('API rejects mismatched bytes, stale reattachment and cross-site binary reads; backups include originals', async ({ page, request }) => {
  await importPdf(page);
  const record = (await (await request.get('/api/library?kind=pdfs')).json())[0];
  expect((await request.post('/api/library?kind=pdfs',{headers,data:{action:'attach',id,revision:record.revision,original:makePdf([textPage('Mismatch')]).toString('base64')}})).status()).toBe(400);
  expect((await request.post('/api/library?kind=pdfs',{headers,data:{action:'attach',id,revision:'stale',original:bytes.toString('base64')}})).status()).toBe(400);
  expect((await request.get(`/api/pdfs/${id}`,{headers:{Origin:'https://evil.example'}})).status()).toBe(403);
  const response = await request.get(`/api/pdfs/${id}`); expect(response.headers()['content-type']).toBe('application/octet-stream'); expect(response.headers()['content-security-policy']).toContain('sandbox');
  const root=mkdtempSync('/tmp/wayoffmars-test-pdf-backup-');
  execFileSync(process.execPath,['scripts/library-backup.mjs','backup',join(root,'backup')],{env:{...process.env,WAYOFFMARS_DATA_DIR:process.env.WAYOFFMARS_TEST_DATA_DIR}});
  execFileSync(process.execPath,['scripts/library-backup.mjs','restore',join(root,'backup'),join(root,'restored')]);
  expect(readFileSync(join(root,'restored','assets',id))).toEqual(bytes);
});

test('embedded scripts and link annotations are not executed or made interactive', async ({ page }) => {
  const active = makePdf([textPage('PDF with inactive script and link')], false, false, true);
  const activeId = createHash('sha256').update(active).digest('hex');
  const dialogs: string[] = [], external: string[] = [], errors: string[] = [];
  page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  page.on('request', req => { if (req.url().startsWith('https://')) external.push(req.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await ready(page); await page.getByLabel('Choose PDF', { exact:true }).setInputFiles({name:'Active.pdf',mimeType:'application/pdf',buffer:active});
  await expect(page.getByRole('region', { name:'PDF library' }).getByRole('status')).toContainText('saved on this Mac');
  await page.goto(`/pdf/${activeId}?page=1`); await rendered(page,1);
  await page.locator('canvas').click();
  await expect(page.locator('iframe, object, embed, .annotationLayer')).toHaveCount(0);
  await expect(page.getByRole('link', {name:/example.invalid/})).toHaveCount(0);
  expect(dialogs).toEqual([]); expect(external).toEqual([]); expect(errors).toEqual([]);
});

test('verifying an identical legacy record never detaches an already retained original', async ({ page, request }) => {
  await importPdf(page);
  const record = (await (await request.get('/api/library?kind=pdfs')).json())[0];
  const result = await request.post('/api/library?kind=pdfs', {headers,data:{action:'import',record}});
  expect(await result.json()).toBe('verified existing');
  expect(await (await request.get(`/api/pdfs/${id}`)).body()).toEqual(bytes);
  expect((await (await request.get('/api/library?kind=pdfs')).json())[0].hasOriginal).toBe(true);
});
