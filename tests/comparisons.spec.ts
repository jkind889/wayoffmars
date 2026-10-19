import { test, expect } from './fixtures';
import { post } from './helpers/tags';
import sharp from 'sharp';
import path from 'node:path';

test('image shortlist survives filtering, limits to four and handles deletion with keyboard/mobile comparison', async ({ page, request }) => {
  const images = [];
  for (let i = 0; i < 5; i++) {
    const bytes = await sharp({ create: { width: 40 + i, height: 30, channels: 3, background: '#888' } }).png().toBuffer();
    images.push((await (await post(request, 'images', { action: 'save', filename: `Image${i}.png`, bytes: bytes.toString('base64') })).json()).image);
  }
  await page.goto('/images');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: `Compare Image${i}.png` }).click();
  await expect(page.getByRole('button', { name: 'Compare Image4.png' })).toBeDisabled();
  await page.getByLabel('Filter images').fill('Image4');
  await expect(page.getByText('4 of 4 images shortlisted.', { exact: false })).toBeVisible();
  await post(request, 'images', { action: 'delete', id: images[0].id, expectedRevision: images[0].revision });
  const trigger = page.getByRole('button', { name: 'Compare images', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Compare images' });
  await expect(dialog.getByText('Image no longer available')).toBeVisible();
  await expect(dialog.getByRole('img')).toHaveCount(3);
  await expect.poll(() => dialog.getByRole('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: '/tmp/wayoffmars-compare-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/wayoffmars-compare-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('font comparisons use shared specimen appearance and detect deleted saved fonts', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose font files' })).toBeEnabled();
  await page.getByLabel('Choose font files').setInputFiles(['ttf', 'woff'].map(ext => path.join(__dirname, `fixtures/fonts/SourceSerif4-Regular.${ext}`)));
  await expect(page.locator('.font-row')).toHaveCount(2);
  for (const ext of ['ttf', 'woff']) await page.getByRole('button', { name: `Compare SourceSerif4-Regular.${ext}` }).click();
  await page.getByLabel('Filter saved fonts').fill('nothing');
  await page.getByRole('button', { name: 'Compare fonts', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Comparison text').fill('A shared specimen');
  await dialog.getByLabel('Tracking (em)').fill('0.2');
  await dialog.getByLabel('Alignment', { exact: true }).selectOption('center');
  await expect(dialog.locator('.font-sample')).toHaveCount(2);
  await expect(dialog.locator('.font-sample').first()).toHaveCSS('text-align', 'center');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.comparison-dialog .font-sample' });
  const rendered = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  expect(rendered.fonts.some(font => font.isCustomFont && font.glyphCount > 0)).toBe(true);
  await cdp.detach();
  await page.screenshot({ path: '/tmp/wayoffmars-font-compare-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/wayoffmars-font-compare-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Preview text')).toHaveValue('A shared specimen');
  const fonts = await (await request.get('/api/library?kind=fonts')).json();
  await post(request, 'fonts', { action: 'delete', id: fonts[0].id });
  await page.getByRole('button', { name: 'Compare fonts', exact: true }).click();
  await expect(dialog.getByText('Font no longer available')).toBeVisible();
});
