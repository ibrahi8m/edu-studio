import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * 1.5.1 regression: the desktop shell's offline guard (electron/main.cjs) cancelled EVERY non-app request,
 * including the owner's Supabase project, so «حساب سحابي» always showed «تعذّر الاتصال بالخادم».
 * This test signs in through the real UI of the PACKAGED app and records, in the main process, what happened
 * to each request. It does not need Supabase to be reachable: it checks that the Supabase request is no longer
 * cancelled by the app (net::ERR_BLOCKED_BY_CLIENT) while any other host still is.
 * Proof of a working cloud connection itself must come from a machine that can reach supabase.co.
 */
test('packaged app: the Supabase sign-in request is not blocked by the app; other hosts still are', async () => {
  const app = await electron.launch({
    executablePath: resolve('release/linux-unpacked/ibrahi8m-edu-studio'),
    args: ['--no-sandbox'],
    env: { ...process.env, IBRAHI8M_USER_DATA: mkdtempSync(join(tmpdir(), 'ibrahi8m-cloudnet-')) },
  });
  await app.evaluate(({ session }) => {
    const g = globalThis as unknown as { netLog: { url: string; error: string }[] };
    g.netLog = [];
    session.defaultSession.webRequest.onErrorOccurred((d) => g.netLog.push({ url: d.url, error: d.error }));
  });
  const w = await app.firstWindow();
  await w.getByTestId('mode-cloud').click();
  await w.getByRole('link', { name: 'إلى تسجيل الدخول' }).click();
  await w.getByTestId('login-user').fill('diagnostic@example.com');
  await w.getByTestId('login-password').fill('not-a-real-password-1');
  await w.getByTestId('login-submit').click();
  await expect(w.getByTestId('auth-error')).toBeVisible({ timeout: 30000 });
  const uiMessage = await w.getByTestId('auth-error').innerText();

  // a host that is NOT allowed must still be cancelled by the app's own guard (main process, past the page's CSP)
  await app.evaluate(({ session }) => session.defaultSession.fetch('https://example.com/').catch(() => undefined));
  await w.waitForTimeout(300);
  const log = await app.evaluate(() => (globalThis as unknown as { netLog: { url: string; error: string }[] }).netLog);
  await app.close();

  const sb = log.filter((l) => l.url.includes('.supabase.co'));
  console.log('UI message:', uiMessage);
  console.log('network errors:', JSON.stringify(log, null, 1));
  // A blocked Supabase request = the bug. Any other outcome (a reply from Supabase, or a network error outside the app) is not the app blocking it.
  expect(sb.filter((l) => l.error === 'net::ERR_BLOCKED_BY_CLIENT')).toEqual([]);
  expect(log.some((l) => l.url.startsWith('https://example.com') && l.error === 'net::ERR_BLOCKED_BY_CLIENT')).toBe(true);
});
