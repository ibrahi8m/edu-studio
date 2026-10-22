import { _electron as electron, expect, test } from '@playwright/test';
import { signedIn } from './signin';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const launch = (userData: string) => electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, IBRAHI8M_USER_DATA: userData } });

/** 1.2.0 in the desktop app: background, theme and generated sound; choices survive a restart, playback does not. */
test('desktop app: animated background, light theme and generated music work; after reopening the theme is kept and nothing plays', async () => {
  test.setTimeout(120_000);
  const userData = mkdtempSync(join(tmpdir(), 'ibrahi8m-desktop-look-'));
  const app1 = await launch(userData);
  const w1 = await app1.firstWindow();
  await signedIn(w1);
  await expect(w1.getByTestId('page-dashboard')).toBeVisible({ timeout: 10_000 });
  await expect(w1.getByTestId('ambient-bg')).toHaveAttribute('data-state', 'moving');
  await w1.locator('[data-testid=theme-button]:visible').click();
  await expect.poll(() => w1.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await w1.locator('[data-testid=sound-button]:visible').click();
  await w1.getByTestId('sound-popover').getByTestId('music-play').click();
  await expect(w1.getByTestId('sound-popover').getByTestId('music-state')).toHaveText('تعمل الآن');
  await expect.poll(() => w1.evaluate(() => (window as unknown as { ibrahi8mAudio: { log: { starts: number } } }).ibrahi8mAudio.log.starts)).toBe(1);
  await app1.close();

  const app2 = await launch(userData);
  const w2 = await app2.firstWindow();
  await signedIn(w2);
  await expect(w2.getByTestId('page-dashboard')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => w2.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await w2.waitForTimeout(500);
  expect(await w2.evaluate(() => (window as unknown as { ibrahi8mAudio: { getState: () => { transport: string } } }).ibrahi8mAudio.getState().transport)).toBe('stopped');
  await app2.close();
});
