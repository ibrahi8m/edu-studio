import { chromium, expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { STATE } from './auth-setup';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const ROUTES = ['', 'projects', 'builder', 'studio', 'quizzes', 'learn', 'results', 'library', 'backup', 'settings', 'about', 'more', 'ai-studio', 'me'];

/** A real on-disk browser profile, so a "restart" keeps IndexedDB and the service worker. */
export function newProfileDir() {
  return mkdtempSync(join(tmpdir(), 'ibrahi8m-profile-'));
}

export async function launchProfile(dir: string, info: TestInfo, opts: { signedIn?: boolean } = {}): Promise<BrowserContext> {
  const u = info.project.use;
  const ctx = await chromium.launchPersistentContext(dir, {
    viewport: u.viewport ?? undefined,
    deviceScaleFactor: u.deviceScaleFactor,
    isMobile: u.isMobile,
    hasTouch: u.hasTouch,
    userAgent: u.userAgent,
    baseURL: u.baseURL,
    locale: 'ar',
  });
  // 1.5.0: a real profile starts signed in as the test admin, once (later restarts keep their own state)
  if (opts.signedIn === false) return ctx; // a real first run: no account on this profile
  const seed = JSON.parse(readFileSync(STATE, 'utf8')).origins[0].localStorage as { name: string; value: string }[];
  await ctx.addInitScript((items: { name: string; value: string }[]) => {
    if (!localStorage.getItem('ibrahi8m.accounts.v1')) for (const it of items) localStorage.setItem(it.name, it.value);
  }, seed);
  return ctx;
}

/** First visit online: installs the service worker and its precache, then reloads under its control. */
export async function primeOffline(page: Page) {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
}

export async function waitPastSplash(page: Page) {
  const splash = page.getByTestId('splash');
  if (await splash.isVisible().catch(() => false)) {
    await expect(splash).toBeHidden({ timeout: 6_000 });
  }
}

/** Records every request; anything not served from the app's own origin is a failure. */
export function watchNetwork(page: Page, origin: string) {
  const external: string[] = [];
  const failed: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  page.on('requestfailed', (r) => failed.push(`${r.url()} — ${r.failure()?.errorText}`));
  return { external, failed };
}

/**
 * After a block is added the editor scrolls smoothly to it and focuses its first
 * field (~250 ms). Wait for both, so the next click does not land on a target
 * that is still moving.
 */
export async function settleAfterAdd(page: Page) {
  await page.waitForTimeout(300);
  await page.waitForFunction(
    () =>
      new Promise<boolean>((done) => {
        const y = window.scrollY;
        requestAnimationFrame(() => requestAnimationFrame(() => done(window.scrollY === y)));
      }),
    undefined,
    { polling: 100, timeout: 5000 },
  );
}
