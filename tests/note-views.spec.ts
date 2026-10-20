import { test, expect } from './fixtures';
import { post } from './helpers/tags';
import type { APIRequestContext } from '@playwright/test';

const preference = 'wayoffmars-notes-view-v1';
async function seedNotes(request: APIRequestContext, count: number, long = false) {
  for (let index = 0; index < count; index++) {
    const note = {
      id: `view note/${index}`, title: `Layout note ${String(index).padStart(2, '0')}`,
      body: (long ? 'A quiet page with generous space. '.repeat(1000) : 'Collect a few ideas about type, space and rhythm.'),
      tags: [index % 2 ? 'typography' : 'layout', 'reference'], source: 'https://example.com/inspiration',
      createdAt: 1, updatedAt: 100 - index, revision: `view-${index}`,
    };
    if (index === count - 1) note.body += ' farawayneedle';
    expect((await post(request, 'notes', { action: 'write', note, id: note.id, expectedRevision: null })).ok()).toBe(true);
  }
}

test('list/grid keep rendering bounded, share pagination and search, and remember the view', async ({ page, request, context }) => {
  await seedNotes(request, 31, true);
  await page.goto('/notes');
  const views = page.getByRole('group', { name: 'Note view' });
  const cards = page.locator('.notes-results article');
  const search = page.getByRole('searchbox', { name: 'Search notes and PDFs', exact: true });
  await expect(views.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(cards).toHaveCount(25);
  await expect(page.locator('.notes-results .note-body, .note-preview')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Manage linked images' })).toHaveCount(0);
  await expect(cards.first().getByRole('list', { name: 'Tags' })).toHaveText('layoutreference');
  await views.getByRole('button', { name: 'Grid', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(views.getByRole('button', { name: 'Grid', exact: true })).toBeFocused();
  await expect(page.locator('.note-preview')).toHaveCount(25);
  expect(await page.locator('.note-preview').evaluateAll(elements => elements.every(element => element.textContent!.length <= 241))).toBe(true);
  await expect(page.locator('.notes-results .note-body')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next notes' }).first().click();
  await expect(cards).toHaveCount(6);
  await views.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Note result page' })).toHaveValue('1');
  await expect(cards.first()).toHaveAccessibleName('Layout note 25');
  await search.fill('farawayneedle');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAccessibleName('Layout note 30');
  await expect(page.locator('.note-snippets mark')).toHaveText('farawayneedle');
  await views.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(search).toHaveValue('farawayneedle');
  await page.getByRole('button', { name: 'Read full note' }).click();
  await expect(page.locator('.note-body mark')).toHaveText('farawayneedle');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(cards).toHaveCount(25);
  await expect(page.locator('.note-body')).toHaveCount(0);
  await search.fill('typography');
  await expect(cards).toHaveCount(15);
  await expect(page.locator('.note-tags mark')).toHaveCount(15);
  await page.reload();
  await expect(views.getByRole('button', { name: 'Grid', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const reopened = await context.newPage();
  await reopened.goto('/notes');
  await expect(reopened.getByRole('group', { name: 'Note view' }).getByRole('button', { name: 'Grid', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await reopened.close();
  await page.goto('/notes#note-view%20note%2F30');
  await expect(cards.first()).toHaveAccessibleName('Layout note 25');
  const target = page.getByRole('article', { name: 'Layout note 30' });
  await expect(target).toBeFocused();
  await expect(target.locator('.note-body')).toBeVisible();
  await expect(target.getByRole('button', { name: 'Layout note 30', exact: true })).toHaveAttribute('aria-expanded', 'true');
});

test('both note layouts open details and edit safely with desktop and narrow keyboard access', async ({ page, request }) => {
  await seedNotes(request, 6);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text()); });
  await page.goto('/notes');
  await expect(page).toHaveTitle('Design notes | wayoffmars');
  const views = page.getByRole('group', { name: 'Note view' });
  const first = page.getByRole('article', { name: 'Layout note 00' });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
    for (const view of ['List', 'Grid']) {
      await views.getByRole('button', { name: view, exact: true }).click();
      await page.getByRole('heading', { name: 'Saved notes', exact: true }).scrollIntoViewIfNeeded();
      if (width === 390) await page.getByRole('heading', { name: 'Saved notes', exact: true }).evaluate(element => element.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const positions = await page.locator('.notes-results > li').evaluateAll(elements => elements.slice(0, 2).map(element => ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y })));
      if (view === 'Grid' && width === 1280) {
        expect(positions[1].x).toBeGreaterThan(positions[0].x);
        expect(positions[1].y).toBe(positions[0].y);
      } else {
        expect(positions[1].x).toBe(positions[0].x);
        expect(positions[1].y).toBeGreaterThan(positions[0].y);
      }
      await page.screenshot({ path: `/tmp/wayoffmars-notes-${view.toLowerCase()}-${width}.png` });
      await first.getByRole('button', { name: 'Layout note 00', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(first.locator('.note-body')).toBeVisible();
      await expect(first.getByRole('link', { name: 'Manage shared tags' })).toBeVisible();
      await first.getByRole('button', { name: 'Layout note 00', exact: true }).press('Enter');
      await expect(first.locator('.note-body')).toHaveCount(0);
    }
  }
  await first.getByRole('button', { name: 'Edit Layout note 00' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
  await page.getByLabel('Body', { exact: true }).fill('A draft kept across both layouts.');
  await views.getByRole('button', { name: 'List', exact: true }).click();
  await views.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.getByLabel('Body', { exact: true })).toHaveValue('A draft kept across both layouts.');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Edit Layout note 01' }).click();
  await expect(page.getByLabel('Body', { exact: true })).toHaveValue('A draft kept across both layouts.');
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.getByLabel('Body', { exact: true })).toHaveValue('A draft kept across both layouts.');
  await expect(views.getByRole('button', { name: 'Grid', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(first.locator('.note-body')).toHaveText('A draft kept across both layouts.');
  await expect(page.getByRole('button', { name: 'New note', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test('invalid or unavailable layout preferences do not prevent browsing or switching views', async ({ page, request }) => {
  await seedNotes(request, 1);
  await page.addInitScript(key => { try { localStorage.setItem(key, 'invalid'); } catch { /* Storage is deliberately blocked on the second load. */ } }, preference);
  await page.goto('/notes');
  const views = page.getByRole('group', { name: 'Note view' });
  await expect(views.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Unavailable', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Unavailable', 'SecurityError'); };
  });
  await page.reload();
  await expect(page.getByRole('article', { name: 'Layout note 00' })).toBeVisible();
  await views.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(views.getByRole('button', { name: 'Grid', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.note-preview')).toHaveCount(1);
});
