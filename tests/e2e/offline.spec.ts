import { expect, test } from '@playwright/test';
import { launchProfile, newProfileDir, primeOffline, ROUTES, waitPastSplash, watchNetwork } from './helpers';

test.describe('Phase 0 — offline foundation', () => {
  test('first online visit precaches the whole app (code, fonts, photo, icons)', async ({ page }) => {
    await primeOffline(page);
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        const c = await caches.open(name);
        for (const req of await c.keys()) urls.push(new URL(req.url).pathname);
      }
      return urls;
    });
    expect(cached.some((u) => u.endsWith('/index.html'))).toBe(true);
    expect(cached.some((u) => u.endsWith('ibrahim-portrait.webp'))).toBe(true);
    expect(cached.some((u) => u.endsWith('ibrahim-avatar.webp'))).toBe(true);
    expect(cached.filter((u) => u.endsWith('.woff2')).length).toBeGreaterThanOrEqual(14);
    expect(cached.some((u) => u.endsWith('.js'))).toBe(true);
    expect(cached.some((u) => u.endsWith('.css'))).toBe(true);
  });

  test('after a full browser restart with the network cut, the app opens, navigates and keeps data', async ({}, info) => {
    const dir = newProfileDir();
    const base = String(info.project.use.baseURL);

    // ── Session 1: online install + change settings ──
    const ctx1 = await launchProfile(dir, info);
    const p1 = ctx1.pages()[0] ?? (await ctx1.newPage());
    await primeOffline(p1);
    await waitPastSplash(p1);
    await p1.goto('./#/settings');
    await p1.getByRole('radio', { name: 'نهاري' }).click();
    await p1.getByRole('radio', { name: 'كبير' }).click();
    // 1.5.0: the name shown in the greeting is the signed-in account's («حسابي»)
    await p1.goto('./#/account');
    await p1.getByTestId('account-name').fill('مستخدم — اختبار الحفظ');
    await p1.getByTestId('account-name-save').click();
    await expect(p1.getByTestId('toast').last()).toContainText('حُفظ الاسم');
    await ctx1.close(); // the whole browser process exits

    // ── Session 2: new browser process, offline from the very first request ──
    const ctx2 = await launchProfile(dir, info);
    await ctx2.setOffline(true);
    const page = ctx2.pages()[0] ?? (await ctx2.newPage());
    const net = watchNetwork(page, base);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('./');
    // Splash with the real photo, served from the local cache
    await expect(page.getByTestId('splash')).toBeVisible();
    // (phase 7 added the logo next to the photo: both must load from the local cache)
    const photo = page.getByTestId('splash').locator('.portrait-frame img');
    const logo = page.getByTestId('splash').locator('img.brand-glyph');
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    await waitPastSplash(page);

    await expect(page.getByTestId('page-dashboard')).toBeVisible();
    await expect(page.getByTestId('offline-banner')).toBeVisible();
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);

    // Settings survived the restart
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim())).toBe('1.15');
    await expect(page.getByTestId('hero-title')).toContainText('مستخدم — اختبار الحفظ');
    await page.goto('./#/account');
    await expect(page.getByTestId('account-name')).toHaveValue('مستخدم — اختبار الحفظ');

    // Every screen opens offline
    for (const r of ROUTES) {
      await page.goto(`./#/${r}`);
      await expect(page.locator('.page, .take-wrap').first()).toBeVisible();
    }

    // Local Arabic fonts are actually loaded (not system fallbacks)
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))];
    });
    expect(fonts).toContain('IBM Plex Sans Arabic');
    expect(fonts).toContain('Readex Pro');

    // All images on the page decoded
    const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
    expect(broken).toEqual([]);

    expect(net.external, 'no request may leave the app').toEqual([]);
    expect(net.failed, 'no request may fail offline').toEqual([]);
    expect(errors).toEqual([]);
    await ctx2.close();
  });

  test('document is Arabic and right-to-left', async ({ page }) => {
    await page.goto('./');
    expect(await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir])).toEqual(['ar', 'rtl']);
  });

  test('production build ships a strict Content-Security-Policy', async ({ page }) => {
    await page.goto('./');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("font-src 'self'");
  });
});
