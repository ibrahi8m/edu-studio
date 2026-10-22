import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { signedIn } from './signin';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const launch = (userData: string, downloads: string) =>
  electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, IBRAHI8M_USER_DATA: userData, IBRAHI8M_DOWNLOAD_DIR: downloads } });
const go = (w: Page, hash: string) => w.goto(`app://edu/index.html#${hash}`);

test('desktop app: a visual summary is designed, exported as a PNG file with its Arabic name, and is still there after reopening', async () => {
  test.setTimeout(120_000);
  const userData = mkdtempSync(join(tmpdir(), 'ibrahi8m-desktop-studio-'));
  const downloads = mkdtempSync(join(tmpdir(), 'ibrahi8m-desktop-dl-'));

  const app1 = await launch(userData, downloads);
  const w1 = await app1.firstWindow();
  await signedIn(w1);
  await expect(w1.getByTestId('page-dashboard')).toBeVisible({ timeout: 10_000 });
  await go(w1, '/settings');
  await w1.getByTestId('toggle-splash').uncheck();
  await go(w1, '/projects');
  await w1.getByTestId('new-project').click();
  await w1.getByTestId('project-title').fill('وحدة الطاقة');
  await w1.getByTestId('project-save').click();
  await expect(w1.getByTestId('project-heading')).toHaveText('وحدة الطاقة');

  await go(w1, '/studio');
  await w1.getByTestId('new-design').click();
  await w1.getByTestId('kind-summary').check();
  await w1.getByTestId('design-title-input').fill('ملخص سطح المكتب');
  await w1.getByTestId('design-project-select').selectOption({ label: 'وحدة الطاقة' });
  await w1.getByTestId('create-design-save').click();
  await w1.getByTestId('summary-heading').fill('مصادر الطاقة');
  await w1.getByTestId('point-title-input').nth(0).fill('متجددة');
  await w1.getByTestId('point-title-input').nth(1).fill('غير متجددة');
  await w1.getByTestId('point-title-input').nth(2).fill('الأثر البيئي');
  await w1.waitForTimeout(150);
  await expect(w1.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
  await w1.getByTestId('export-png').click();
  await expect(w1.getByText(/صُدّرت الصورة «ملخص سطح المكتب.png»/)).toBeVisible();
  const file = join(downloads, 'ملخص سطح المكتب.png');
  await expect.poll(() => existsSync(file), { timeout: 10_000 }).toBe(true);
  const png = readFileSync(file);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(1800);
  await w1.screenshot({ path: 'docs/screenshots/desktop-app/studio-summary.png' });
  await app1.close();

  const app2 = await launch(userData, downloads);
  const w2 = await app2.firstWindow();
  await signedIn(w2);
  await go(w2, '/studio');
  await w2.getByRole('link', { name: 'فتح التصميم: ملخص سطح المكتب' }).click();
  await expect(w2.getByTestId('summary-heading')).toHaveValue('مصادر الطاقة');
  await expect(w2.getByTestId('design-preview').getByTestId('design-point')).toHaveCount(3);
  await app2.close();
});
