import { test, expect } from './fixtures';
import { post } from './helpers/tags';

const note = { id: 'detail note/with space', title: 'Quiet rhythm', body: 'A full note about generous space.', tags: ['layout'], source: 'https://example.com/reference', createdAt: 1, updatedAt: 1, revision: 'initial' };

test('note details have a reloadable URL, preserve list context, and handle missing notes', async ({ page, request }) => {
  for (let i = 0; i < 27; i++) await post(request, 'notes', { action: 'write', id: `detail-${i}`, expectedRevision: null, note: { ...note, id: `detail-${i}`, title: `Layout ${i}`, updatedAt: 100-i } });
  await page.goto('/notes');
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await page.getByLabel('Search notes and PDFs', { exact: true }).fill('layout');
  await page.getByRole('combobox', { name: 'Note result page', exact: true }).selectOption('1');
  await expect(page.getByRole('button', { name: /^Edit |^Delete / })).toHaveCount(0);
  await page.getByRole('link', { name: 'Layout 25', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/notes\/detail-25\?q=layout&page=1$/);
  await expect(page.getByRole('article', { name: 'Layout 25', exact: true })).toBeFocused();
  await expect(page.locator('.note-body')).toHaveText(note.body);
  await expect(page.getByRole('searchbox', { name: 'Search notes and PDFs', exact: true })).toHaveCount(0);
  await page.reload(); await expect(page.locator('.note-body')).toHaveText(note.body);
  await page.getByRole('link', { name: 'Back to saved notes' }).click();
  await expect(page.getByLabel('Search notes and PDFs', { exact: true })).toHaveValue('layout');
  await expect(page.getByRole('combobox', { name: 'Note result page', exact: true })).toHaveValue('1');
  await expect(page.getByRole('button', { name: 'Grid', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article', { name: 'Layout 25', exact: true })).toBeFocused();
  await page.goto('/notes/missing');
  await expect(page.getByRole('heading', { name: 'Note not found' })).toBeFocused();
  await page.getByRole('link', { name: 'Back to saved notes' }).click();
  await expect(page.locator('.notes-results article')).toHaveCount(25);
});

test('detail editing, cancellation, draft reload, legacy links and deletion stay safe on desktop and mobile', async ({ page, request }) => {
  await post(request, 'notes', { action: 'write', id: note.id, expectedRevision: null, note });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/notes#note-${encodeURIComponent(note.id)}`);
  await expect(page).toHaveURL(`/notes/${encodeURIComponent(note.id)}`);
  const article = page.getByRole('article', { name: note.title, exact: true });
  await expect(article).toBeFocused();
  await page.screenshot({ path: '/tmp/wayoffmars-note-detail-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/wayoffmars-note-detail-mobile.png', fullPage: true });
  await page.getByRole('button', { name: `Edit ${note.title}` }).click();
  await page.getByLabel('Body', { exact: true }).fill('An unfinished revision.');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('link', { name: 'Back to saved notes' }).click();
  await expect(page.getByLabel('Body', { exact: true })).toHaveValue('An unfinished revision.');
  page.once('dialog', dialog => dialog.accept()); await page.reload();
  await expect(page.getByLabel('Body', { exact: true })).toHaveValue('An unfinished revision.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(article.locator('.note-body')).toHaveText('An unfinished revision.'); await expect(article).toBeFocused();
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: `Delete ${note.title}` }).click();
  await expect(article).toBeVisible();
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: `Delete ${note.title}` }).click();
  await expect(page.getByRole('heading', { name: 'Note not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to saved notes' })).toBeFocused();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Note not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to saved notes' }).click();
  await expect(page.getByText('Room for your next idea')).toBeVisible();
  expect(errors).toEqual([]);
});

test('browser back retains search and paging, and a failed detail read never claims deletion', async ({ page, request }) => {
  await post(request, 'notes', { action: 'write', id: note.id, expectedRevision: null, note });
  await page.goto('/notes');
  await page.getByLabel('Search notes and PDFs', { exact: true }).fill('layout');
  await page.getByRole('link', { name: note.title, exact: true }).click();
  await expect(page.locator('.note-body')).toHaveText(note.body);
  await page.goBack();
  await expect(page.getByLabel('Search notes and PDFs', { exact: true })).toHaveValue('layout');
  await expect(page.getByRole('article', { name: note.title })).toBeVisible();
  await page.route('**/api/library?kind=notes', route => route.fulfill({ status: 503, json: { error: 'Temporarily unavailable. Retry.' } }));
  await page.goto(`/notes/${encodeURIComponent(note.id)}`);
  await expect(page.getByRole('heading', { name: 'This note could not be loaded' })).toBeFocused();
  await expect(page.getByRole('region', { name: 'Design notes', exact: true }).getByRole('alert')).toContainText('Temporarily unavailable');
  await expect(page.getByText('Note not found', { exact: true })).toHaveCount(0);
  await page.unroute('**/api/library?kind=notes');
  await page.reload(); await expect(page.locator('.note-body')).toHaveText(note.body);
});
