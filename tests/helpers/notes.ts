import { expect, type Page } from '@playwright/test';

export async function openNote(page: Page, title: string) {
  if (new URL(page.url()).pathname === '/notes') {
    await page.getByRole('article', { name: title, exact: true }).getByRole('link', { name: title, exact: true }).click();
  }
  await expect(page.getByRole('article', { name: title, exact: true }).locator('.note-body')).toBeVisible();
}
