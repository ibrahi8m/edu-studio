import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ROUTES, waitPastSplash } from './helpers';

const isPhone = (name: string) => name.startsWith('phone');

test.describe('Phase 0 — responsive shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await waitPastSplash(page);
  });

  test('navigation adapts to the device', async ({ page }, info) => {
    if (isPhone(info.project.name)) {
      await expect(page.locator('.bottom-nav')).toBeVisible();
      await expect(page.locator('.sidebar')).toBeHidden();
      const sizes = await page.locator('.bottom-link').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      expect(sizes.length).toBe(5);
      for (const h of sizes) expect(h).toBeGreaterThanOrEqual(44);
      // Every module is reachable from "more"
      await page.getByRole('link', { name: 'المزيد' }).click();
      await expect(page.getByTestId('page-more')).toBeVisible();
      await page.getByRole('link', { name: /الإعدادات/ }).click();
      await expect(page.getByTestId('page-settings')).toBeVisible();
    } else {
      await expect(page.locator('.sidebar')).toBeVisible();
      await expect(page.locator('.bottom-nav')).toBeHidden();
      await page.locator('.sidebar').getByRole('link', { name: 'الإعدادات' }).click();
      await expect(page.getByTestId('page-settings')).toBeVisible();
    }
  });

  test('no screen scrolls sideways; screenshots for the report', async ({ page }, info) => {
    for (const r of ROUTES) {
      await page.goto(`./#/${r}`);
      await expect(page.locator('.page, .take-wrap').first()).toBeVisible();
      await page.waitForTimeout(350);
      // innerWidth grows past the device width when a phone browser zooms out to fit
      // overflowing content, so compare against the device viewport, not innerWidth.
      const vw = page.viewportSize()!.width;
      const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(scrollW, `horizontal overflow on /${r}`).toBeLessThanOrEqual(vw);
      expect(innerW, `layout zoomed out on /${r}`).toBe(vw);
      await page.screenshot({ path: `docs/screenshots/${info.project.name}/${r || 'dashboard'}.png`, fullPage: true });
    }
  });

  test('splash screen is captured and can be skipped', async ({ page }, info) => {
    // Pause the page clock so the splash cannot close on its own while it is
    // photographed and clicked (it auto-closes after 1.8 s; under load that can pass).
    // clock.install() alone does not stop time; pauseAt() does.
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.goto('./#/');
    await page.reload();
    await expect(page.getByTestId('splash')).toBeVisible();
    await page.waitForTimeout(700); // real time, for the entrance animation
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/splash.png` });
    await page.getByRole('button', { name: 'تخطي' }).click();
    await expect(page.getByTestId('splash')).toBeHidden();
    // and it also closes by itself once its time is up
    await page.reload();
    await expect(page.getByTestId('splash')).toBeVisible();
    await page.clock.runFor(2000);
    await expect(page.getByTestId('splash')).toBeHidden();
  });

  test('a saved light theme never flashes dark while the app starts', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByRole('radio', { name: 'نهاري' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
    // Record every theme the page paints from the very first script onwards.
    await page.addInitScript(() => {
      const w = window as unknown as { __themes: string[] };
      w.__themes = [];
      // Observe the document (the <html> element may not exist yet when this runs).
      new MutationObserver((records) => {
        for (const r of records) if (r.type === 'attributes' && r.target === document.documentElement) w.__themes.push(document.documentElement.dataset.theme ?? '');
      }).observe(document, { attributes: true, attributeFilter: ['data-theme'], subtree: true });
    });
    await page.reload();
    await expect(page.getByTestId('splash')).toBeVisible();
    await page.waitForTimeout(800); // settings have loaded from the database by now
    const painted = await page.evaluate(() => (window as unknown as { __themes: string[] }).__themes);
    expect(painted.length).toBeGreaterThan(0);
    expect(painted).not.toContain('dark');
  });

  test('disabling the splash takes effect on next launch', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByTestId('toggle-splash').uncheck();
    await page.reload();
    await expect(page.getByTestId('page-settings')).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('splash')).toBeHidden();
  });

  test('no serious accessibility violations (axe) in dark and light themes', async ({ page }) => {
    for (const theme of ['داكن', 'فاتح']) {
      await page.goto('./#/settings');
      await page.getByRole('radio', { name: theme }).click();
      for (const r of ['', 'settings', 'about', 'projects', 'more']) {
        await page.goto(`./#/${r}`);
        await expect(page.locator('.page, .take-wrap').first()).toBeVisible();
        await page.waitForTimeout(350);
        const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        const serious = res.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${theme} /${r}: ${v.id} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
        expect(serious).toEqual([]);
      }
    }
  });
});
