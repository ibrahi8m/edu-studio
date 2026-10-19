import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const launch = (userData: string) =>
  electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, IBRAHI8M_USER_DATA: userData } });

test('desktop app runs from disk, blocks the network and keeps data across restarts', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ibrahi8m-desktop-'));

  // First launch: no service worker, no server, files come from dist/ on disk.
  const app1 = await launch(userData);
  const w1 = await app1.firstWindow();
  expect(w1.url()).toBe('app://edu/index.html');
  await expect(w1.getByTestId('splash')).toBeVisible();
  await expect(w1.getByTestId('splash')).toBeHidden({ timeout: 6000 });
  await expect(w1.getByTestId('page-dashboard')).toBeVisible();
  expect(await w1.evaluate(() => window.ibrahi8mDesktop?.platform)).toBeTruthy();
  await expect(w1.getByTestId('status-offline')).toContainText('نسخة سطح المكتب');

  // Any attempt to reach the internet is refused.
  const blocked = await w1.evaluate(async () => {
    try {
      await fetch('https://example.com/');
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);

  const fonts = await w1.evaluate(async () => {
    await document.fonts.ready;
    return [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))];
  });
  expect(fonts).toContain('IBM Plex Sans Arabic');
  const broken = await w1.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length);
  expect(broken).toBe(0);
  await w1.screenshot({ path: 'docs/screenshots/desktop-app/dashboard.png' });

  await w1.goto('app://edu/index.html#/settings');
  await w1.getByRole('radio', { name: 'فاتح' }).click();
  const f = w1.getByTestId('owner-university');
  await f.fill('جامعة — اختبار سطح المكتب');
  await f.blur();
  await expect(w1.getByText('تم الحفظ')).toBeVisible();
  await app1.close();

  // Second launch: data is still there.
  const app2 = await launch(userData);
  const w2 = await app2.firstWindow();
  await expect(w2.getByTestId('page-dashboard')).toBeVisible({ timeout: 8000 });
  await expect.poll(() => w2.evaluate(() => document.documentElement.dataset.theme), { timeout: 5000 }).toBe('light');
  await w2.goto('app://edu/index.html#/about');
  await expect(w2.getByText('جامعة — اختبار سطح المكتب')).toBeVisible();
  await w2.screenshot({ path: 'docs/screenshots/desktop-app/about-light.png' });
  await app2.close();
});
