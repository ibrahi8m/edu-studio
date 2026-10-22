import { expect, type Page } from '@playwright/test';

/**
 * 1.5.0: the desktop app opens on the sign-in screen. A fresh profile shows the first-run setup
 * (the owner creates the admin account); a known one shows the login unless the session is still valid.
 */
export const DESKTOP_ADMIN = { user: 'desk-admin', pass: 'Desk-pass-2026' };

export async function signedIn(w: Page) {
  const setup = w.getByTestId('page-setup');
  const login = w.getByTestId('page-login');
  const inside = w.locator('.shell, [data-testid=student-shell]');
  await expect(setup.or(login).or(inside).first()).toBeVisible({ timeout: 15_000 });
  await expect(w.getByTestId('splash')).toBeHidden({ timeout: 10_000 });
  if (await setup.isVisible()) {
    await w.getByTestId('setup-user').fill(DESKTOP_ADMIN.user);
    await w.getByTestId('setup-password').fill(DESKTOP_ADMIN.pass);
    await w.getByTestId('setup-password2').fill(DESKTOP_ADMIN.pass);
    await w.getByTestId('setup-submit').click();
    await w.getByTestId('setup-continue').click();
  } else if (await login.isVisible()) {
    await w.getByTestId('login-user').fill(DESKTOP_ADMIN.user);
    await w.getByTestId('login-password').fill(DESKTOP_ADMIN.pass);
    await w.getByTestId('login-submit').click();
  }
  await expect(inside.first()).toBeVisible({ timeout: 10_000 });
}
