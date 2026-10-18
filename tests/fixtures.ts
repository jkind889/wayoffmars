import { test as base, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
export { expect };
export type { Page };
export function resetLibrary() {
  const directory = process.env.WAYOFFMARS_TEST_DATA_DIR;
  if (!directory?.startsWith('/tmp/wayoffmars-test-')) throw new Error('Tests require an isolated temporary library.');
  execFileSync(process.execPath, ['--input-type=module', '-e', `import {openLibrary} from './src/lib/server/database.mjs'; const db=openLibrary(process.argv[1]); db.exec('DELETE FROM records; DELETE FROM imports;'); db.close();`, directory], { stdio: 'pipe' });
}
export const test = base.extend<{ isolatedLibrary: void }>({
  isolatedLibrary: [async ({}, use) => { resetLibrary(); await use(); }, { auto: true }],
});
export async function failStorage(page: Page, kind: string, action: string, message = 'Local disk write failed. Retry.') {
  await page.route(`**/api/library?kind=${kind}`, async route => {
    const request = route.request();
    const body = request.method() === 'POST' ? request.postDataJSON() : null;
    const allowed = await page.evaluate(() => sessionStorage.getItem('allowSave') || sessionStorage.getItem('allowPdf'));
    if (!allowed && (action === 'all' || action === 'read' && !body || action === 'save' && body && body.action !== 'delete' && body.note !== null || action === 'delete' && body && (body.action === 'delete' || body.note === null))) {
      await route.fulfill({ status: 503, json: { error: message } });
    } else await route.continue();
  });
}
