import { expect, test, type Page } from '@playwright/test';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { openSync } from 'node:fs';
import { get } from 'node:http';
import { resolve } from 'node:path';
import { launchProfile, newProfileDir } from './helpers';

/**
 * Real upgrade path: the released 0.2.0 build creates projects, lessons and
 * settings in a browser profile; then the current build is served on the SAME
 * address, the installed app offers its update, and every earlier record must
 * still be there and open in the new lesson editor.
 */
const PORT = 4190;
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const ROOT = resolve('.');
const LEGACY = resolve('.legacy/0.2.0');

/** true when the server answers (plain http; the worker's fetch may be proxied). */
function isUp(): Promise<boolean> {
  return new Promise((ok) => {
    const req = get(ORIGIN, (r) => {
      r.resume();
      ok((r.statusCode ?? 0) < 500);
    });
    req.on('error', () => ok(false));
    req.setTimeout(2000, () => {
      req.destroy();
      ok(false);
    });
  });
}

function serve(cwd: string): Promise<ChildProcess> {
  const p = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd, detached: true, stdio: ['ignore', openSync(resolve('test-results/upgrade-server.log'), 'a'), openSync(resolve('test-results/upgrade-server.log'), 'a')] });
  return new Promise((ok, fail) => {
    const started = Date.now();
    const poll = async () => {
      if (await isUp()) return ok(p);
      if (Date.now() - started > 30_000) {
        stop(p);
        return fail(new Error('server did not start (see test-results/upgrade-server.log)'));
      }
      setTimeout(poll, 250);
    };
    void poll();
  });
}

function stop(p: ChildProcess | undefined) {
  if (p?.pid) {
    try {
      process.kill(-p.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

async function waitForPort(free: boolean) {
  for (let i = 0; i < 60; i++) {
    const up = await isUp();
    if (up !== free) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function skipSplash(page: Page) {
  const s = page.getByTestId('splash');
  if (await s.isVisible().catch(() => false)) await page.getByRole('button', { name: 'تخطي' }).click();
}

test.describe('Upgrade from 0.2.0 keeps every record', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test.beforeAll(() => {
    execSync('node scripts/build-legacy.mjs a4bfde7 0.2.0', { cwd: ROOT, stdio: 'inherit' });
  });

  test('projects, lessons and settings created in 0.2.0 survive the update and open in the 0.3.0 editor', async ({}, info) => {
    test.skip(!['desktop-1440', 'phone-pixel-7'].includes(info.project.name), 'one computer and one phone size');
    const profile = newProfileDir();
    let server: ChildProcess | undefined;
    try {
      // ── 0.2.0: install, create data ──
      server = await serve(LEGACY);
      const ctx1 = await launchProfile(profile, info);
      const p1 = ctx1.pages()[0] ?? (await ctx1.newPage());
      await p1.goto(ORIGIN);
      await p1.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await p1.reload();
      await expect.poll(() => p1.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await skipSplash(p1);
      await p1.goto(`${ORIGIN}#/settings`);
      await expect(p1.locator('.kv dd[dir=ltr]').nth(1)).toHaveText('0.2.0');
      await p1.getByRole('radio', { name: 'فاتح' }).click();
      const full = p1.getByTestId('owner-ownerFullName');
      await full.fill('إبراهيم — بيانات الإصدار 0.2.0');
      await full.blur();
      await expect(p1.getByText('تم الحفظ')).toBeVisible();

      await p1.goto(`${ORIGIN}#/projects`);
      await p1.getByTestId('new-project').click();
      await p1.getByTestId('project-title').fill('مشروع من الإصدار السابق');
      await p1.getByTestId('project-subject').fill('العلوم');
      await p1.getByTestId('project-save').click();
      await expect(p1.getByTestId('project-heading')).toHaveText('مشروع من الإصدار السابق');
      for (const [t, d] of [
        ['الدرس القديم الأول', '45'],
        ['الدرس القديم الثاني', ''],
      ]) {
        await p1.getByTestId('new-lesson').first().click();
        await p1.getByTestId('lesson-title').fill(t);
        if (d) await p1.getByTestId('lesson-duration').fill(d);
        await p1.getByTestId('lesson-save').click();
        await expect(p1.getByTestId('lesson-dialog')).toBeHidden();
      }
      await ctx1.close();
      stop(server);
      await waitForPort(true);

      // ── 0.3.0 on the same address ──
      server = await serve(ROOT);
      const ctx2 = await launchProfile(profile, info);
      const page = ctx2.pages()[0] ?? (await ctx2.newPage());
      await page.goto(ORIGIN);
      await skipSplash(page);
      // The installed 0.2.0 app detects the new version and asks before switching.
      await expect(page.getByText('يتوفر إصدار أحدث من التطبيق.')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: 'تحديث الآن' }).click();
      await page.waitForLoadState('load');
      await skipSplash(page);
      await page.goto(`${ORIGIN}#/settings`);
      await expect(page.locator('.kv dd[dir=ltr]').nth(1)).toHaveText('0.3.0', { timeout: 15_000 });
      await expect(page.locator('.kv dd[dir=ltr]').first()).toContainText('v3');

      // Settings from 0.2.0
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
      await page.goto(`${ORIGIN}#/about`);
      await expect(page.getByTestId('about-name')).toHaveText('إبراهيم — بيانات الإصدار 0.2.0');

      // Projects and lessons from 0.2.0
      await page.goto(`${ORIGIN}#/projects`);
      await expect(page.getByTestId('project-card')).toHaveCount(1);
      await page.getByTestId('project-card').first().click();
      await expect(page.getByTestId('project-heading')).toHaveText('مشروع من الإصدار السابق');
      await expect(page.getByTestId('project-lessons').locator('.lesson-title')).toHaveText(['الدرس القديم الأول', 'الدرس القديم الثاني']);

      // An old lesson opens in the new editor with its card intact, and gains content
      await page.getByRole('button', { name: 'فتح محرر الدرس: الدرس القديم الأول' }).click();
      await expect(page.getByTestId('page-editor')).toBeVisible();
      await expect(page.getByTestId('lesson-title-field')).toHaveValue('الدرس القديم الأول');
      await expect(page.getByTestId('lesson-duration-field')).toHaveValue('45');
      await page.getByTestId('add-objective').click();
      await page.getByRole('radio', { name: '1 التذكر' }).click();
      await page.getByTestId('verb-bank').getByRole('button', { name: 'يذكر', exact: true }).click();
      await page.getByTestId('objective-content').fill('مثالًا على الطاقة');
      await page.waitForTimeout(120);
      await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });

      // The updated app now works offline too
      await ctx2.setOffline(true);
      await page.reload();
      await expect(page.getByTestId('page-editor')).toBeVisible();
      await expect(page.getByTestId('objective-statement')).toHaveText('أن يذكر الطالب مثالًا على الطاقة.');
      await ctx2.close();
    } finally {
      stop(server);
      await waitForPort(true);
    }
  });
});
