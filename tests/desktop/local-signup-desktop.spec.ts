import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signedIn } from './signin';

const launch = (userData: string) => electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, IBRAHI8M_USER_DATA: userData } });

test('1.6.0 desktop: a local account created from the sign-in screen survives closing and reopening the app (no network)', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ibrahi8m-localsignup-'));
  const app1 = await launch(userData);
  const w1 = await app1.firstWindow();
  await signedIn(w1); // owner (first run)
  await w1.goto('app://edu/index.html#/account');
  await w1.getByTestId('logout').click();
  await w1.getByTestId('to-local-signup').click();
  await w1.getByTestId('local-signup-user').fill('desk.student');
  await w1.getByTestId('local-signup-password').fill('Desk-student-1');
  await w1.getByTestId('local-signup-password2').fill('Desk-student-1');
  await w1.getByTestId('local-signup-submit').click();
  await expect(w1.getByTestId('local-signup-done')).toBeVisible();
  await app1.close();

  const app2 = await launch(userData);
  const w2 = await app2.firstWindow();
  await expect(w2.getByTestId('page-login')).toBeVisible({ timeout: 15_000 });
  await expect(w2.getByTestId('splash')).toBeHidden({ timeout: 10_000 });
  await w2.getByTestId('login-user').fill('desk.student');
  await w2.getByTestId('login-password').fill('Desk-student-1');
  await w2.getByTestId('login-submit').click();
  await expect(w2.getByTestId('student-shell')).toBeVisible({ timeout: 10_000 });
  await w2.goto('app://edu/index.html#/settings');
  await expect(w2.getByTestId('page-forbidden')).toBeVisible();
  await app2.close();
});
