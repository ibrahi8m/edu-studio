import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const launch = (userData: string) => electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, IBRAHI8M_USER_DATA: userData } });
const go = (w: Page, hash: string) => w.goto(`app://edu/index.html#${hash}`);

test('desktop app: the new logo shows, the demo project installs with its pictures (no network at all), and is still there after reopening', async () => {
  test.setTimeout(120_000);
  const userData = mkdtempSync(join(tmpdir(), 'ibrahi8m-desktop-demo-'));
  const app1 = await launch(userData);
  const w1 = await app1.firstWindow();
  await expect(w1.getByTestId('splash').locator('img.brand-glyph')).toBeVisible({ timeout: 10_000 });
  await go(w1, '/settings');
  await w1.getByTestId('toggle-splash').uncheck();
  // the sidebar shows the new mark, loaded from inside the app
  const mark = w1.locator('img.brand-mark').first();
  await expect.poll(() => mark.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await mark.getAttribute('src')).toContain('ibrahi8m-mark.svg');
  await w1.getByTestId('demo-panel').getByTestId('demo-install').click();
  await expect(w1.getByTestId('demo-panel')).toHaveAttribute('data-installed', 'true', { timeout: 15_000 });
  await go(w1, '/preview/demo-lesson-3?notes=1');
  await expect(w1.getByTestId('teacher-panel')).toContainText('لماذا صُمم الدرس هكذا؟');
  await expect.poll(() => w1.locator('img[alt^="آثار أقدام"]').evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBe(960);
  await w1.screenshot({ path: 'docs/screenshots/desktop-app/demo-preview.png' });
  await app1.close();

  const app2 = await launch(userData);
  const w2 = await app2.firstWindow();
  await go(w2, '/results');
  await expect(w2.getByTestId('results-row')).toHaveCount(3);
  await expect(w2.getByTestId('student-row')).toHaveCount(10);
  await app2.close();
});
