import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { signedIn } from '../desktop/signin';

test('packaged Linux build starts and shows the dashboard from disk', async () => {
  const app = await electron.launch({
    executablePath: resolve('release/linux-unpacked/ibrahi8m-edu-studio'),
    args: ['--no-sandbox'],
    env: { ...process.env, IBRAHI8M_USER_DATA: mkdtempSync(join(tmpdir(), 'ibrahi8m-pkg-')) },
  });
  const w = await app.firstWindow();
  await signedIn(w); // 1.5.0: first-run owner setup
  await expect(w.getByTestId('page-dashboard')).toBeVisible({ timeout: 10000 });
  await expect(w.getByTestId('status-offline')).toContainText('نسخة سطح المكتب');
  await app.close();
});
