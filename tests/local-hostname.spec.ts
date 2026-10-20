import { test, expect } from './fixtures';
import { note } from './helpers/tags';

const friendly = 'http://wayoffmars.localhost:3107';
const host = 'wayoffmars.localhost:3107';
const headers = { Host: host, Origin: friendly, 'X-Wayoffmars': '1' };

test('exact friendly hostname accepts same-origin reads/writes while all API guards remain enforced', async ({ request }) => {
  // Node uses the OS resolver; override Host only for these direct HTTP guard checks.
  // The browser test below resolves the actual hostname without any override.
  for (const localHost of [host, 'localhost:3107', '127.0.0.1:3107', '[::1]:3107']) {
    expect((await request.get('/api/library?kind=notes', { headers: { Host: localHost, Origin: `http://${localHost}` } })).ok()).toBe(true);
  }
  const data = { action: 'import', record: note };
  for (const badHost of ['evil.example:3107', 'other.localhost:3107', 'wayoffmars.localhost.evil.example:3107', 'wayoffmars.localhost.:3107', 'prefixwayoffmars.localhost:3107']) {
    const badHeaders = { ...headers, Host: badHost, Origin: `http://${badHost}` };
    expect((await request.get('/api/library?kind=notes', { headers: badHeaders })).status()).toBe(403);
    expect((await request.post('/api/library?kind=notes', { headers: badHeaders, data })).status()).toBe(403);
  }
  for (const origin of ['http://localhost:3107', 'http://127.0.0.1:3107', 'http://wayoffmars.localhost:3000', 'https://wayoffmars.localhost:3107', 'https://evil.example', 'null']) {
    expect((await request.get('/api/library?kind=notes', { headers: { ...headers, Origin: origin } })).status()).toBe(403);
    expect((await request.post('/api/library?kind=notes', { headers: { ...headers, Origin: origin }, data })).status()).toBe(403);
  }
  const invalidMutations: Record<string, string>[] = [{ Host: host }, { Host: host, Origin: friendly }, { ...headers, 'Sec-Fetch-Site': 'cross-site' }, { ...headers, 'Content-Type': 'text/plain' }];
  for (const badHeaders of invalidMutations) {
    expect((await request.post('/api/library?kind=notes', { headers: badHeaders, data })).status()).toBe(403);
  }
  expect(await (await request.get('/api/library?kind=notes')).json()).toEqual([]);
  expect((await request.post('/api/library?kind=notes', { headers, data })).ok()).toBe(true);
  expect(await (await request.get('/api/library?kind=notes', { headers })).json()).toEqual([note]);
  expect((await request.post('/api/library?kind=notes', { headers, data: { action: 'write', id: note.id, expectedRevision: note.revision, note: null } })).ok()).toBe(true);
});

test('Mac Chrome resolves the friendly hostname locally, uses a secure context and shares saved library but isolates browser state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    // The existing checkout has no favicon; keep the user's favicon outside scope.
    if (message.location().url.endsWith('/favicon.ico') && message.text().includes('404')) return;
    if (['error', 'warning'].includes(message.type())) errors.push(`${message.location().url}: ${message.text()}`);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose font files', exact: true })).toBeEnabled();
  await page.getByLabel('Choose font files', { exact: true }).setInputFiles('tests/fixtures/fonts/SourceSerif4-Regular.ttf');
  await expect(page.getByText('Saved on this Mac', { exact: true })).toHaveCount(1);
  await page.evaluate(async () => {
    localStorage.setItem('hostname-check', 'old-origin');
    sessionStorage.setItem('hostname-check', 'old-origin');
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('hostname-check', 1);
      open.onsuccess = () => { open.result.close(); resolve(); }; open.onerror = () => reject(open.error);
    });
  });
  const response = await page.goto(friendly);
  expect(response?.ok()).toBe(true);
  expect(['127.0.0.1', '::ffff:127.0.0.1', '::1']).toContain((await response!.serverAddr())?.ipAddress);
  await expect(page).toHaveURL(friendly + '/');
  await expect(page).toHaveTitle('Font library | wayoffmars');
  await expect(page.getByText('Saved on this Mac', { exact: true })).toHaveCount(1);
  await expect(page.locator('.font-sample')).toBeVisible();
  const state = await page.evaluate(async () => ({
    secure: isSecureContext,
    fontAPI: typeof (window as Window & { queryLocalFonts?: unknown }).queryLocalFonts,
    fontPermission: (await navigator.permissions.query({ name: 'local-fonts' as PermissionName })).state,
    local: localStorage.getItem('hostname-check'), session: sessionStorage.getItem('hostname-check'),
    oldDatabase: (await indexedDB.databases()).some(db => db.name === 'hostname-check'),
  }));
  expect(state).toEqual({ secure: true, fontAPI: 'function', fontPermission: 'prompt', local: null, session: null, oldDatabase: false });
  // No permission grant, OS font enumeration, DNS override or hosts-file edit.
  await page.getByRole('link', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Friendly address fixture');
  await page.getByLabel('Body', { exact: true }).fill('The same library through a local alias.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Friendly address fixture' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('article', { name: 'Friendly address fixture' })).toBeVisible();
  await page.screenshot({ path: '/tmp/wayoffmars-friendly-host-desktop.png', fullPage: true });
  await page.goto('/notes');
  await expect(page.getByRole('article', { name: 'Friendly address fixture' })).toBeVisible();
  expect(await page.evaluate(async () => ({ local: localStorage.getItem('hostname-check'), session: sessionStorage.getItem('hostname-check'), oldDatabase: (await indexedDB.databases()).some(db => db.name === 'hostname-check') }))).toEqual({ local: 'old-origin', session: 'old-origin', oldDatabase: true });
  await page.goto(friendly + '/textures');
  await expect(page.getByRole('heading', { name: 'Your texture library' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/wayoffmars-friendly-host-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
