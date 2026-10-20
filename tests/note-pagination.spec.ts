import { execFileSync } from 'node:child_process';
import { test, expect } from './fixtures';

function seed(count: number) {
  const directory = process.env.WAYOFFMARS_TEST_DATA_DIR;
  if (!directory?.startsWith('/tmp/wayoffmars-test-')) throw new Error('Isolated library required.');
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import {openLibrary} from './src/lib/server/database.mjs';
    const db=openLibrary(process.argv[1]); db.exec('BEGIN');
    for(let i=0;i<Number(process.argv[2]);i++) {
      const id='paged note/'+i, title='Paged '+String(i).padStart(3,'0');
      const note={id,title,body:('typography rhythm ').repeat(100)+(i===60?' rareword':''),tags:[],source:'',createdAt:1,updatedAt:1000-i,revision:'r'+i};
      db.prepare("INSERT INTO records(kind,id,data) VALUES('notes',?,?)").run(id,JSON.stringify(note));
    }
    db.exec('COMMIT');db.close();`, directory, String(count)], { stdio: 'pipe' });
}

test('notes bound rendering, search all pages, highlight on demand and preserve drafts during keyboard paging', async ({ page }) => {
  seed(61);
  await page.goto('/notes');
  const cards = page.locator('article[id^="note-"]');
  const search = page.getByRole('searchbox', { name: 'Search notes and PDFs', exact: true });
  await expect(cards).toHaveCount(25);
  await expect(page.getByText('Showing 1–25 of 61 notes. Search covers every saved note.')).toBeVisible();
  await page.getByRole('button', { name: 'Next notes' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(cards.first()).toHaveAccessibleName('Paged 025');
  await expect(page.getByRole('heading', { name: 'Saved notes', exact: true })).toBeFocused();
  await page.getByRole('combobox', { name: 'Note result page', exact: true }).selectOption('2');
  await expect(cards).toHaveCount(11);
  await expect(page.getByRole('button', { name: 'Next notes' }).first()).toBeDisabled();
  await search.fill('rareword');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAccessibleName('Paged 060');
  await expect(page.locator('.note-full-text .note-body')).toHaveCount(0);
  await page.getByText('Read full note', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.note-full-text .note-body mark')).toHaveText('rareword');
  await page.getByRole('link', { name: 'Back to saved notes' }).click();
  await expect(page.locator('.note-full-text .note-body')).toHaveCount(0);
  await search.fill('typography');
  await expect(cards).toHaveCount(25);
  await expect(page.getByRole('combobox', { name: 'Note result page', exact: true })).toHaveValue('0');
  await expect(page.locator('.note-full-text .note-body')).toHaveCount(0);
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByLabel('Body', { exact: true }).fill('An unfinished draft');
  await page.getByRole('combobox', { name: 'Note result page', exact: true }).selectOption('2');
  await expect(page.getByLabel('Body', { exact: true })).toHaveValue('An unfinished draft');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('navigation', { name: 'Note result pages', exact: true }).screenshot({ path: '/tmp/wayoffmars-note-pagination-mobile.png' });
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.getByLabel('Body', { exact: true })).toHaveValue('An unfinished draft');
});

test('direct links select and focus distant notes; deleting a last-page result clamps navigation', async ({ page }) => {
  seed(26);
  await page.goto('/notes#note-paged%20note%2F25');
  const last = page.getByRole('article', { name: 'Paged 025', exact: true });
  await expect(last).toBeFocused();
  await page.getByRole('link', { name: 'Back to saved notes' }).click();
  await page.getByRole('combobox', { name: 'Note result page', exact: true }).selectOption('1');
  await page.getByRole('searchbox', { name: 'Search notes and PDFs', exact: true }).fill('no-match');
  await page.evaluate(() => { location.hash = '#note-paged%20note%2F1'; });
  await expect(page.getByRole('article', { name: 'Paged 001', exact: true })).toBeFocused();
  await page.getByRole('link', { name: 'Back to saved notes' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search notes and PDFs', exact: true })).toHaveValue('');
  await page.getByRole('combobox', { name: 'Note result page', exact: true }).selectOption('1');
  await page.getByRole('link', { name: 'Paged 025', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete Paged 025', exact: true }).click();
  await page.getByRole('link', { name: 'Back to saved notes' }).click();
  await expect(page.locator('article[id^="note-"]')).toHaveCount(25);
  await expect(page.getByRole('combobox', { name: 'Note result page', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Saved notes', exact: true })).toBeFocused();
});
