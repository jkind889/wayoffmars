import { test, expect, failStorage, type Page } from './fixtures';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const fixture = path.join(__dirname, 'fixtures/fonts/SourceSerif4-Regular.ttf');
type AccessState = { queries: number; reads: number; activated: boolean; error: string; missing: boolean; empty: boolean; release: null | (() => void) };
type TestWindow = typeof window & { fontAccessTest: AccessState };
async function mockFonts(page: Page, error = '', hold: '' | 'query' | 'blob' = '') {
  await page.addInitScript(({ bytes, error, hold }) => {
    const state = { queries: 0, reads: 0, activated: false, error, missing: false, empty: false, release: null as null | (() => void) };
    Object.defineProperty(window, 'fontAccessTest', { value: state });
    Object.defineProperty(window, 'queryLocalFonts', { configurable: true, value: async () => {
      state.queries++; state.activated = navigator.userActivation.isActive;
      await new Promise(resolve => setTimeout(resolve, 40));
      if (hold === 'query') await new Promise<void>(resolve => { state.release = resolve; });
      if (state.error) throw new DOMException('Fixture permission response', state.error);
      if (state.empty) return [];
      return ['SourceSerif4-Regular', 'Other-fixture'].map(name => ({ family: 'Source Serif 4', fullName: name, postscriptName: name, style: 'Regular', blob: async () => {
        state.reads++;
        if (hold === 'blob') await new Promise<void>(resolve => { state.release = resolve; });
        if (state.missing) throw new DOMException('Fixture removed', 'NotFoundError');
        return new Blob([new Uint8Array(bytes)]);
      } }));
    } });
  }, { bytes: [...readFileSync(fixture)], error, hold });
}
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose font files', exact: true })).toBeEnabled();
}
async function preview(page: Page) {
  await page.getByRole('button', { name: 'Browse installed fonts', exact: true }).click();
  await page.getByLabel('Installed font', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: 'Preview installed font', exact: true }).click();
  await expect(page.locator('.installed-font-preview .font-sample')).toBeVisible();
}
async function exported(page: Page) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const file = await (await event).path();
  return JSON.parse(readFileSync(file!, 'utf8'));
}

test('installed fonts require a gesture, read one selected face and save only explicitly', async ({ page, request }) => {
  await mockFonts(page);
  const external: string[] = [];
  page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:3107') && !req.url().startsWith('data:')) external.push(req.url()); });
  await ready(page);
  expect(await page.evaluate(() => (window as TestWindow).fontAccessTest.queries)).toBe(0);
  await preview(page);
  expect(await page.evaluate(() => (window as TestWindow).fontAccessTest)).toMatchObject({ queries: 1, reads: 1, activated: true });
  expect(await (await request.get('/api/library?kind=fonts')).json()).toHaveLength(0);
  expect((await exported(page)).fonts).toHaveLength(0);
  expect(await page.evaluate(() => Object.keys(localStorage).length + Object.keys(sessionStorage).length)).toBe(0);
  const sample = page.locator('.installed-font-preview .font-sample');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.installed-font-preview .font-sample' });
  await sample.scrollIntoViewIfNeeded();
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  expect(fonts.some((font: { isCustomFont: boolean; glyphCount: number }) => font.isCustomFont && font.glyphCount > 0)).toBe(true);
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.getByText('A copy is saved in the library below and included in backups.')).toBeVisible();
  await expect(page.locator('.font-row')).toHaveCount(1);
  const records = await (await request.get('/api/library?kind=fonts')).json();
  expect(records).toHaveLength(1);
  expect(records[0].name).toBe('SourceSerif4-Regular.ttf');
  expect(Buffer.from((await exported(page)).fonts[0].data, 'base64')).toEqual(readFileSync(fixture));
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.locator('.font-row')).toHaveCount(1);
  expect(await (await request.get('/api/library?kind=fonts')).json()).toEqual(records);
  await page.getByRole('button', { name: 'Clear installed preview' }).click();
  await expect(page.getByLabel('Installed font', { exact: true })).toBeFocused();
  expect(await page.evaluate(() => Array.from(document.fonts).some(font => font.family.startsWith('installed-')))).toBe(false);
  await page.reload();
  await expect(page.locator('.font-row')).toHaveCount(1);
  await expect(page.getByLabel('Installed font', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as TestWindow).fontAccessTest.queries)).toBe(0);
  expect(external).toEqual([]);
});

for (const error of ['NotAllowedError', 'AbortError', 'SecurityError']) {
  test(`font access ${error} leaves uploaded fonts usable and retry works`, async ({ page }) => {
    await mockFonts(page, error); await ready(page);
    await page.getByRole('button', { name: 'Browse installed fonts', exact: true }).click();
    await expect(page.locator('.installed-fonts').getByRole('alert')).toContainText(error === 'SecurityError' ? 'blocked' : 'not granted');
    await expect(page.getByRole('button', { name: 'Browse installed fonts', exact: true })).toBeFocused();
    await page.getByLabel('Choose font files', { exact: true }).setInputFiles(fixture);
    await expect(page.locator('.font-row')).toHaveCount(1);
    await page.evaluate(() => { (window as TestWindow).fontAccessTest.error = ''; });
    await preview(page);
  });
}

for (const mode of ['unsupported', 'insecure']) {
  test(`${mode} font access retains the file import workflow`, async ({ page }) => {
    await page.addInitScript(mode => {
      if (mode === 'unsupported') Object.defineProperty(window, 'queryLocalFonts', { value: undefined, configurable: true });
      else Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    }, mode);
    await ready(page);
    await expect(page.getByRole('button', { name: 'Browse installed fonts', exact: true })).toBeDisabled();
    await expect(page.getByText(mode === 'unsupported' ? /does not support installed-font browsing/ : /needs a secure context/)).toBeVisible();
    await page.getByLabel('Choose font files', { exact: true }).setInputFiles(fixture);
    await expect(page.locator('.font-row')).toHaveCount(1);
  });
}

test('removed fonts and empty refresh clear temporary previews without saving', async ({ page, request }) => {
  await mockFonts(page); await ready(page); await preview(page);
  await page.evaluate(() => { (window as TestWindow).fontAccessTest.missing = true; });
  await page.getByLabel('Installed font', { exact: true }).selectOption('1');
  await expect(page.locator('.installed-font-preview')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview installed font', exact: true }).click();
  await expect(page.locator('.installed-fonts').getByRole('alert')).toContainText('no longer available');
  await page.evaluate(() => { (window as TestWindow).fontAccessTest.empty = true; });
  await page.getByRole('button', { name: 'Browse installed fonts', exact: true }).click();
  await expect(page.getByText('No installed fonts were returned. You can still choose font files.')).toBeVisible();
  expect(await (await request.get('/api/library?kind=fonts')).json()).toHaveLength(0);
});

test('failed explicit save remains temporary and can retry without duplicates', async ({ page, request }) => {
  await mockFonts(page); await failStorage(page, 'fonts', 'save'); await ready(page); await preview(page);
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.locator('.installed-fonts').getByRole('alert')).toContainText('Font was not saved');
  await expect(page.locator('.font-row')).toHaveCount(0);
  expect(await (await request.get('/api/library?kind=fonts')).json()).toHaveLength(0);
  expect((await exported(page)).fonts).toHaveLength(0);
  await page.evaluate(() => sessionStorage.setItem('allowSave', '1'));
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.locator('.font-row')).toHaveCount(1);
});

test('appearance controls affect uploaded and installed specimens, reset and reflow', async ({ page }) => {
  await mockFonts(page); await ready(page);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByLabel('Choose font files', { exact: true }).setInputFiles(fixture);
  await preview(page);
  await page.getByRole('textbox', { name: 'Preview text', exact: true }).fill('Quiet type\nA second line');
  await page.getByRole('slider', { name: /Preview size/ }).press('Home');
  for (let step = 0; step < 36; step++) await page.getByRole('slider', { name: /Preview size/ }).press('ArrowRight');
  const tracking = page.getByRole('spinbutton', { name: 'Tracking (em)', exact: true });
  await tracking.fill(''); await tracking.pressSequentially('-0.05'); await tracking.press('Tab');
  await expect(tracking).toHaveValue('-0.05');
  const leading = page.getByRole('spinbutton', { name: 'Line height', exact: true });
  await leading.fill(''); await leading.pressSequentially('0.9'); await leading.press('Tab');
  await expect(leading).toHaveValue('0.9');
  await tracking.fill('0.1');
  await page.getByRole('spinbutton', { name: 'Line height', exact: true }).fill('2');
  await page.getByLabel('Alignment', { exact: true }).selectOption('center');
  await page.getByLabel('Text color', { exact: true }).fill('#eeeeee');
  await page.getByLabel('Background color', { exact: true }).fill('#222222');
  const samples = page.locator('.font-sample');
  await expect(samples).toHaveCount(2);
  for (const sample of await samples.all()) {
    await expect(sample).toHaveText('Quiet type\nA second line');
    await expect(sample).toHaveCSS('letter-spacing', '4.8px');
    await expect(sample).toHaveCSS('line-height', '96px');
    await expect(sample).toHaveCSS('text-align', 'center');
    await expect(sample).toHaveCSS('color', 'rgb(238, 238, 238)');
    await expect(sample).toHaveCSS('background-color', 'rgb(34, 34, 34)');
  }
  await expect(page.locator('.wordmark')).toHaveCSS('color', 'rgb(158, 21, 21)');
  await page.screenshot({ path: '/tmp/wayoffmars-font-features-desktop.png', fullPage: true });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) await page.screenshot({ path: '/tmp/wayoffmars-font-features-mobile.png', fullPage: true });
  }
  await page.getByRole('textbox', { name: 'Preview text', exact: true }).fill('LongUnbrokenSpecimen'.repeat(20));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('textbox', { name: 'Preview text', exact: true }).fill('Quiet type\nA second line');
  await page.getByRole('button', { name: 'Reset appearance' }).focus();
  await page.keyboard.press('Enter');
  await expect(tracking).toHaveValue('0');
  await expect(samples.first()).toHaveCSS('letter-spacing', 'normal');
  await expect(samples.first()).toHaveCSS('line-height', '76.8px');
  await expect(samples.first()).toHaveCSS('text-align', 'left');
  await expect(page.getByRole('textbox', { name: 'Preview text', exact: true })).toHaveValue('Quiet type\nA second line');
  await page.reload();
  await expect(page.getByRole('slider', { name: /Preview size/ })).toHaveValue('32');
  expect(errors).toEqual([]);
});

for (const hold of ['query', 'blob'] as const) {
  test(`delayed ${hold} completion does not steal focus from specimen editing`, async ({ page }) => {
    await mockFonts(page, '', hold); await ready(page);
    await page.getByRole('button', { name: 'Browse installed fonts', exact: true }).click();
    if (hold === 'blob') {
      await page.getByLabel('Installed font', { exact: true }).selectOption('0');
      await page.getByRole('button', { name: 'Preview installed font', exact: true }).click();
    }
    await expect.poll(() => page.evaluate(() => Boolean((window as TestWindow).fontAccessTest.release))).toBe(true);
    const text = page.getByRole('textbox', { name: 'Preview text', exact: true });
    await text.fill('Keep typing here');
    await page.evaluate(() => (window as TestWindow).fontAccessTest.release!());
    if (hold === 'query') await expect(page.getByLabel('Installed font', { exact: true })).toBeEnabled();
    else await expect(page.locator('.installed-font-preview')).toBeVisible();
    await expect(text).toBeFocused();
  });
}

test('installed font focus waits for an overlapping file import to finish', async ({ page }) => {
  await mockFonts(page, '', 'query'); await ready(page);
  let releaseSave!: () => void;
  const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
  let saving = false;
  await page.route('**/api/library?kind=fonts', async route => {
    if (route.request().method() === 'POST') { saving = true; await saveGate; }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Browse installed fonts', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as TestWindow).fontAccessTest.release))).toBe(true);
  await page.getByLabel('Choose font files', { exact: true }).setInputFiles(fixture);
  await expect.poll(() => saving).toBe(true);
  await page.evaluate(() => (window as TestWindow).fontAccessTest.release!());
  const picker = page.getByLabel('Installed font', { exact: true });
  await expect(picker).toBeVisible(); await expect(picker).toBeDisabled();
  releaseSave();
  await expect(picker).toBeEnabled(); await expect(picker).toBeFocused();
});

test('shared form boundaries remain distinguishable on both app surfaces', async ({ page }) => {
  await ready(page);
  const contrast = await page.getByRole('textbox', { name: 'Preview text', exact: true }).evaluate(element => {
    const css = getComputedStyle(element);
    const luminance = (color: string) => color.match(/\d+/g)!.slice(0, 3).map(Number).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const border = luminance(css.borderTopColor);
    return [css.backgroundColor, getComputedStyle(document.body).backgroundColor].map(color => {
      const surface = luminance(color);
      return (Math.max(border, surface) + 0.05) / (Math.min(border, surface) + 0.05);
    });
  });
  expect(Math.min(...contrast)).toBeGreaterThanOrEqual(3);
});
