import { openQuizAs } from './quiz-helpers';
import { expect, test, type Page } from '@playwright/test';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { openSync, readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
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
const LEGACY3 = resolve('.legacy/0.3.0');
const LEGACY4 = resolve('.legacy/0.4.0');
const LEGACY5 = resolve('.legacy/0.5.0');
const LEGACY6 = resolve('.legacy/0.6.0');
const LEGACY7 = resolve('.legacy/0.7.0');
const CURRENT = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version as string;
const FIXTURE_IMAGE = resolve('tests/fixtures/energy-diagram.png');

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

test.describe('Upgrades keep every record', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test.beforeAll(() => {
    execSync('node scripts/build-legacy.mjs a4bfde7 0.2.0', { cwd: ROOT, stdio: 'inherit' });
    execSync('node scripts/build-legacy.mjs e7c0389 0.3.0', { cwd: ROOT, stdio: 'inherit' });
    execSync('node scripts/build-legacy.mjs ee13516 0.4.0', { cwd: ROOT, stdio: 'inherit' });
    execSync('node scripts/build-legacy.mjs 8465f02 0.5.0', { cwd: ROOT, stdio: 'inherit' });
    execSync('node scripts/build-legacy.mjs 41a5797 0.6.0', { cwd: ROOT, stdio: 'inherit' });
    // 02f8d6f = 0.7.0 with its package.json restored (e9092d1 shipped a stripped one)
    execSync('node scripts/build-legacy.mjs 02f8d6f 0.7.0', { cwd: ROOT, stdio: 'inherit' });
  });

  test('projects, lessons and settings created in 0.2.0 survive the update and open in the current lesson editor', async ({}, info) => {
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

      // ── current version on the same address ──
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
      await expect(page.locator('.kv dd[dir=ltr]').nth(1)).toHaveText(CURRENT, { timeout: 15_000 });
      await expect(page.locator('.kv dd[dir=ltr]').first()).toContainText('v7');

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
  test('a lesson with objectives and a local image made in 0.3.0 survives the update, and a new quiz measures its objective', async ({}, info) => {
    test.skip(!['desktop-1440', 'phone-pixel-7'].includes(info.project.name), 'one computer and one phone size');
    const profile = newProfileDir();
    let server: ChildProcess | undefined;
    try {
      // ── 0.3.0: lesson editor with an objective and a stored image ──
      server = await serve(LEGACY3);
      const ctx1 = await launchProfile(profile, info);
      const p1 = ctx1.pages()[0] ?? (await ctx1.newPage());
      await p1.goto(ORIGIN);
      await p1.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await p1.reload();
      await expect.poll(() => p1.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await skipSplash(p1);
      await p1.goto(`${ORIGIN}#/settings`);
      await expect(p1.locator('.kv dd[dir=ltr]').nth(1)).toHaveText('0.3.0');
      await p1.goto(`${ORIGIN}#/projects`);
      await p1.getByTestId('new-project').click();
      await p1.getByTestId('project-title').fill('مشروع من 0.3.0');
      await p1.getByTestId('project-save').click();
      await p1.getByTestId('new-lesson').first().click();
      await p1.getByTestId('lesson-title').fill('درس بصورة');
      await p1.getByTestId('lesson-save').click();
      await expect(p1.getByTestId('lesson-dialog')).toBeHidden();
      await p1.getByRole('button', { name: 'فتح محرر الدرس: درس بصورة' }).click();
      await p1.getByTestId('add-objective').click();
      await p1.getByRole('radio', { name: '2 الفهم' }).click();
      await p1.getByTestId('verb-bank').getByRole('button', { name: 'يشرح', exact: true }).click();
      await p1.getByTestId('objective-content').fill('مصدر طاقة الرياح');
      await p1.getByTestId('tab-content').click();
      await p1.getByTestId('add-block').last().click();
      await p1.getByTestId('add-image').click();
      await p1.getByTestId('image-input').setInputFiles(FIXTURE_IMAGE);
      await expect(p1.getByTestId('image-preview')).toBeVisible();
      await p1.getByTestId('image-alt').fill('مخطط الطاقة');
      await p1.waitForTimeout(150);
      await expect(p1.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
      await ctx1.close();
      stop(server);
      await waitForPort(true);

      // ── current version ──
      server = await serve(ROOT);
      const ctx2 = await launchProfile(profile, info);
      const page = ctx2.pages()[0] ?? (await ctx2.newPage());
      await page.goto(ORIGIN);
      await skipSplash(page);
      await expect(page.getByText('يتوفر إصدار أحدث من التطبيق.')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: 'تحديث الآن' }).click();
      await page.waitForLoadState('load');
      await skipSplash(page);
      await page.goto(`${ORIGIN}#/settings`);
      await expect(page.locator('.kv dd[dir=ltr]').nth(1)).toHaveText(CURRENT, { timeout: 15_000 });

      // The old lesson: objective and image intact
      await page.goto(`${ORIGIN}#/projects`);
      await page.getByTestId('project-card').first().click();
      await page.getByRole('button', { name: 'فتح محرر الدرس: درس بصورة' }).click();
      await expect(page.getByTestId('objective-statement')).toHaveText('أن يشرح الطالب مصدر طاقة الرياح.');
      await page.getByTestId('tab-content').click();
      await expect.poll(() => page.getByTestId('image-preview').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(1600);
      await expect(page.getByTestId('image-alt')).toHaveValue('مخطط الطاقة');

      // A quiz in the new version can measure that old objective, and be taken
      await page.goto(`${ORIGIN}#/quizzes`);
      await page.getByTestId('new-quiz').click();
      await page.getByTestId('quiz-title-input').fill('اختبار بعد الترقية');
      await page.getByTestId('quiz-project-select').selectOption({ label: 'مشروع من 0.3.0' });
      await page.getByTestId('quiz-lesson-select').selectOption({ label: 'درس بصورة' });
      await page.getByTestId('create-quiz-save').click();
      await page.getByTestId('add-question').last().click();
      await page.getByTestId('add-q-truefalse').click();
      const c = page.getByTestId('question').last();
      await c.getByTestId('q-prompt').fill('تتحرك الرياح بسبب اختلاف حرارة الهواء.');
      await c.getByTestId('q-feedback-incorrect').fill('الشمس تسخن الهواء بشكل غير متساوٍ.');
      await c.getByTestId('tf-true').click();
      await c.getByTestId('q-link').click();
      await expect(page.getByTestId('q-link-dialog')).toContainText('أن يشرح الطالب مصدر طاقة الرياح.');
      await page.getByTestId('q-link-checkbox').first().check();
      await page.getByTestId('q-link-done').click();
      await page.waitForTimeout(150);
      await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
      await openQuizAs(page, 'اختبار بعد الترقية', 'طالب', `${ORIGIN}#/learn`);
      await page.getByTestId('take-start').click();
      await page.getByTestId('take-true').check();
      await page.getByTestId('take-to-review').click();
      await page.getByTestId('take-submit').click();
      await expect(page.getByTestId('result-score')).toHaveText('1 / 1');
      await page.goto(`${ORIGIN}#/results`);
      await page.getByTestId('results-row').first().click();
      await expect(page.getByTestId('objective-stats')).toContainText('أن يشرح الطالب مصدر طاقة الرياح.');
      await ctx2.close();
    } finally {
      stop(server);
      await waitForPort(true);
    }
  });

  test('quizzes and attempts made in 0.4.0 survive the update: a finished attempt stays, an unfinished one resumes in the new student mode', async ({}, info) => {
    test.skip(!['desktop-1440', 'phone-pixel-7'].includes(info.project.name), 'one computer and one phone size');
    const profile = newProfileDir();
    let server: ChildProcess | undefined;
    try {
      // ── 0.4.0: a quiz, one submitted attempt and one left unfinished ──
      server = await serve(LEGACY4);
      const ctx1 = await launchProfile(profile, info);
      const p1 = ctx1.pages()[0] ?? (await ctx1.newPage());
      await p1.goto(ORIGIN);
      await p1.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await p1.reload();
      await expect.poll(() => p1.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await skipSplash(p1);
      await p1.goto(`${ORIGIN}#/settings`);
      await expect(p1.locator('.kv dd[dir=ltr]').nth(1)).toHaveText('0.4.0');
      await p1.goto(`${ORIGIN}#/projects`);
      await p1.getByTestId('new-project').click();
      await p1.getByTestId('project-title').fill('مشروع من 0.4.0');
      await p1.getByTestId('project-save').click();
      await expect(p1.getByTestId('project-heading')).toHaveText('مشروع من 0.4.0');
      await p1.goto(`${ORIGIN}#/quizzes`);
      await p1.getByTestId('new-quiz').click();
      await p1.getByTestId('quiz-title-input').fill('اختبار من 0.4.0');
      await p1.getByTestId('quiz-project-select').selectOption({ label: 'مشروع من 0.4.0' });
      await p1.getByTestId('create-quiz-save').click();
      for (const [prompt, answer] of [
        ['الشمس نجم.', 'tf-true'],
        ['القمر مصدر للضوء.', 'tf-false'],
      ]) {
        await p1.getByTestId('add-question').last().click();
        await p1.getByTestId('add-q-truefalse').click();
        const c = p1.getByTestId('question').last();
        await c.getByTestId('q-prompt').fill(prompt);
        await c.getByTestId('q-feedback-incorrect').fill('راجع الدرس.');
        await c.getByTestId(answer).click();
      }
      await p1.waitForTimeout(150);
      await expect(p1.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
      for (const finish of [true, false]) {
        await p1.goto(`${ORIGIN}#/student`);
        await p1.getByRole('link', { name: 'ابدأ: اختبار من 0.4.0' }).click();
        await p1.getByTestId('student-name').fill('سارة');
        await p1.getByTestId('take-start').click();
        await p1.getByTestId('take-true').check();
        if (finish) {
          await p1.getByTestId('take-next').click();
          await p1.getByTestId('take-false').check();
          await p1.getByTestId('take-to-review').click();
          await p1.getByTestId('take-submit').click();
          await expect(p1.getByTestId('result-score')).toHaveText('2 / 2');
        } else {
          await p1.waitForTimeout(700); // the answer is saved; the attempt stays open
        }
      }
      await ctx1.close();
      stop(server);
      await waitForPort(true);

      // ── current version ──
      server = await serve(ROOT);
      const ctx2 = await launchProfile(profile, info);
      const page = ctx2.pages()[0] ?? (await ctx2.newPage());
      await page.goto(ORIGIN);
      await skipSplash(page);
      await expect(page.getByText('يتوفر إصدار أحدث من التطبيق.')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: 'تحديث الآن' }).click();
      await page.waitForLoadState('load');
      await skipSplash(page);
      await page.goto(`${ORIGIN}#/settings`);
      await expect(page.locator('.kv dd[dir=ltr]').nth(1)).toHaveText(CURRENT, { timeout: 15_000 });
      await expect(page.locator('.kv dd[dir=ltr]').first()).toContainText('v7');
      // the finished attempt is there
      await page.goto(`${ORIGIN}#/results`);
      await page.getByTestId('results-row').first().click();
      await expect(page.getByTestId('sum-attempts')).toHaveText('1');
      await expect(page.getByTestId('attempt-row').first()).toContainText('2/2');
      // the old quiz gets the new settings with safe defaults
      await page.goto(`${ORIGIN}#/quizzes`);
      await page.getByRole('link', { name: 'فتح الاختبار: اختبار من 0.4.0' }).click();
      await page.getByTestId('tab-settings').click();
      await expect(page.getByTestId('set-feedback-timing')).toHaveValue('end');
      await expect(page.getByTestId('set-score-policy')).toHaveValue('best');
      // the unfinished attempt resumes in the new student mode (old name storage is kept)
      await page.goto(`${ORIGIN}#/learn`);
      await expect(page.getByTestId('student-chip')).toHaveText('سارة');
      const row = page.locator('[data-testid="student-quiz"][data-quiz="اختبار من 0.4.0"]');
      await expect(row.getByTestId('student-quiz-status')).toHaveText('محاولة لم تُسلَّم بعد');
      await row.getByTestId('student-quiz-go').click();
      await page.getByTestId('take-resume').click();
      await expect(page.getByTestId('take-progress')).toHaveText('أجبت عن 1 من 2');
      await page.getByTestId('take-false').check();
      await page.getByTestId('take-to-review').click();
      await page.getByTestId('take-submit').click();
      await expect(page.getByTestId('result-score')).toHaveText('2 / 2');
      await expect(page.getByTestId('result-attempt-no')).toHaveText('المحاولة 2 من 2 محاولات محفوظة');
      await page.goto(`${ORIGIN}#/results`);
      await page.getByTestId('student-row').first().locator('a').click();
      await expect(page.getByTestId('student-attempt')).toHaveCount(2);
      await ctx2.close();
    } finally {
      stop(server);
      await waitForPort(true);
    }
  });

  test('lessons and student progress made in 0.5.0 survive the update; the new studio designs a map from that lesson and adds it to the lesson', async ({}, info) => {
    test.skip(!['desktop-1440', 'phone-pixel-7'].includes(info.project.name), 'one computer and one phone size');
    const profile = newProfileDir();
    let server: ChildProcess | undefined;
    try {
      // ── 0.5.0: a lesson with an objective and two parts, opened by a student ──
      server = await serve(LEGACY5);
      const ctx1 = await launchProfile(profile, info);
      const p1 = ctx1.pages()[0] ?? (await ctx1.newPage());
      await p1.goto(ORIGIN);
      await p1.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await p1.reload();
      await expect.poll(() => p1.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await skipSplash(p1);
      await p1.goto(`${ORIGIN}#/settings`);
      await expect(p1.locator('.kv dd[dir=ltr]').nth(1)).toHaveText('0.5.0');
      await p1.goto(`${ORIGIN}#/projects`);
      await p1.getByTestId('new-project').click();
      await p1.getByTestId('project-title').fill('وحدة الطاقة');
      await p1.getByTestId('project-save').click();
      await p1.getByTestId('new-lesson').first().click();
      await p1.getByTestId('lesson-title').fill('مصادر الطاقة');
      await p1.getByTestId('lesson-save').click();
      await expect(p1.getByTestId('lesson-dialog')).toBeHidden();
      await p1.getByRole('button', { name: 'فتح محرر الدرس: مصادر الطاقة' }).click();
      await p1.getByTestId('add-objective').click();
      await p1.getByRole('radio', { name: '1 التذكر' }).click();
      await p1.getByTestId('verb-bank').getByRole('button', { name: 'يعدّد', exact: true }).click();
      await p1.getByTestId('objective-content').fill('مصادر الطاقة المتجددة');
      await p1.waitForTimeout(150);
      await expect(p1.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
      await p1.goto(`${ORIGIN}#/learn`);
      await p1.getByTestId('learn-name').fill('سلمى');
      await p1.getByTestId('learn-continue').click();
      await p1.locator('[data-testid="learn-lesson"][data-lesson="مصادر الطاقة"]').getByTestId('open-lesson').click();
      await p1.getByTestId('lp-next').click();
      await expect(p1.getByTestId('lp-progress-text')).toHaveText('فتحت 2 من 2 أقسام');
      await p1.waitForTimeout(300);
      await ctx1.close();
      stop(server);
      await waitForPort(true);

      // ── current version ──
      server = await serve(ROOT);
      const ctx2 = await launchProfile(profile, info);
      const page = ctx2.pages()[0] ?? (await ctx2.newPage());
      await page.goto(ORIGIN);
      await skipSplash(page);
      await expect(page.getByText('يتوفر إصدار أحدث من التطبيق.')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: 'تحديث الآن' }).click();
      await page.waitForLoadState('load');
      await skipSplash(page);
      await page.goto(`${ORIGIN}#/settings`);
      await expect(page.locator('.kv dd[dir=ltr]').nth(1)).toHaveText(CURRENT, { timeout: 15_000 });
      await expect(page.locator('.kv dd[dir=ltr]').first()).toContainText('v7');
      // the student's progress from 0.5.0
      await page.goto(`${ORIGIN}#/learn`);
      await expect(page.getByTestId('student-chip')).toHaveText('سلمى');
      await expect(page.locator('[data-testid="learn-lesson"][data-lesson="مصادر الطاقة"]').getByTestId('lesson-progress-text')).toHaveText('فتحت 2 من 2 أقسام');
      // the new studio starts a map from the old lesson and adds its picture to it
      await page.goto(`${ORIGIN}#/studio`);
      await page.getByTestId('new-design').click();
      await page.getByTestId('kind-conceptmap').check();
      await page.getByTestId('design-title-input').fill('خريطة بعد الترقية');
      await page.getByTestId('design-project-select').selectOption({ label: 'وحدة الطاقة' });
      await page.getByTestId('design-lesson-select').selectOption({ label: 'مصادر الطاقة' });
      await expect(page.getByTestId('design-from-lesson')).toBeChecked();
      await page.getByTestId('create-design-save').click();
      await expect(page.getByTestId('map-node')).toHaveCount(2);
      await expect(page.locator('[data-testid="map-node"][aria-label="مفهوم: مصادر الطاقة المتجددة"]')).toHaveCount(1);
      await page.getByTestId('add-to-lesson').click();
      await page.getByTestId('add-to-lesson-save').click();
      await expect(page.getByText('أُضيفت صورة التصميم إلى نهاية درس «مصادر الطاقة».')).toBeVisible();
      await page.getByRole('button', { name: 'فتح الدرس' }).click();
      await expect(page.getByTestId('block').last()).toHaveAttribute('data-type', 'image'); // opens on the content tab
      await page.getByTestId('tab-plan').click();
      await expect(page.getByTestId('objective-statement')).toHaveText('أن يعدّد الطالب مصادر الطاقة المتجددة.');
      await ctx2.close();
    } finally {
      stop(server);
      await waitForPort(true);
    }
  });
  test('a lesson and a design made in 0.6.0 survive the update; the lesson goes to the new library and a full backup holds everything', async ({}, info) => {
    test.skip(!['desktop-1440', 'phone-pixel-7'].includes(info.project.name), 'one computer and one phone size');
    const profile = newProfileDir();
    let server: ChildProcess | undefined;
    try {
      // ── 0.6.0: a lesson with an objective and a concept map made from it ──
      server = await serve(LEGACY6);
      const ctx1 = await launchProfile(profile, info);
      const p1 = ctx1.pages()[0] ?? (await ctx1.newPage());
      await p1.goto(ORIGIN);
      await p1.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await p1.reload();
      await expect.poll(() => p1.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await skipSplash(p1);
      await p1.goto(`${ORIGIN}#/settings`);
      await expect(p1.locator('.kv dd[dir=ltr]').nth(1)).toHaveText('0.6.0');
      await p1.goto(`${ORIGIN}#/projects`);
      await p1.getByTestId('new-project').click();
      await p1.getByTestId('project-title').fill('وحدة الطاقة');
      await p1.getByTestId('project-save').click();
      await p1.getByTestId('new-lesson').first().click();
      await p1.getByTestId('lesson-title').fill('مصادر الطاقة');
      await p1.getByTestId('lesson-save').click();
      await expect(p1.getByTestId('lesson-dialog')).toBeHidden();
      await p1.getByRole('button', { name: 'فتح محرر الدرس: مصادر الطاقة' }).click();
      await p1.getByTestId('add-objective').click();
      await p1.getByRole('radio', { name: '1 التذكر' }).click();
      await p1.getByTestId('verb-bank').getByRole('button', { name: 'يعدّد', exact: true }).click();
      await p1.getByTestId('objective-content').fill('مصادر الطاقة المتجددة');
      await p1.waitForTimeout(150);
      await expect(p1.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
      await p1.goto(`${ORIGIN}#/studio`);
      await p1.getByTestId('new-design').click();
      await p1.getByTestId('kind-conceptmap').check();
      await p1.getByTestId('design-title-input').fill('خريطة 0.6');
      await p1.getByTestId('design-project-select').selectOption({ label: 'وحدة الطاقة' });
      await p1.getByTestId('design-lesson-select').selectOption({ label: 'مصادر الطاقة' });
      await expect(p1.getByTestId('design-from-lesson')).toBeChecked();
      await p1.getByTestId('create-design-save').click();
      await expect(p1.getByTestId('map-node')).toHaveCount(2);
      await p1.waitForTimeout(150);
      await expect(p1.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
      await ctx1.close();
      stop(server);
      await waitForPort(true);

      // ── current version ──
      server = await serve(ROOT);
      const ctx2 = await launchProfile(profile, info);
      const page = ctx2.pages()[0] ?? (await ctx2.newPage());
      await page.goto(ORIGIN);
      await skipSplash(page);
      await expect(page.getByText('يتوفر إصدار أحدث من التطبيق.')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: 'تحديث الآن' }).click();
      await page.waitForLoadState('load');
      await skipSplash(page);
      await page.goto(`${ORIGIN}#/settings`);
      await expect(page.locator('.kv dd[dir=ltr]').nth(1)).toHaveText(CURRENT, { timeout: 15_000 });
      await expect(page.locator('.kv dd[dir=ltr]').first()).toContainText('v7');
      // the 0.6.0 design opens as it was
      await page.goto(`${ORIGIN}#/studio`);
      await page.getByRole('link', { name: /خريطة 0\.6/ }).first().click();
      await expect(page.getByTestId('map-node')).toHaveCount(2);
      // the old lesson goes into the new library as a template
      await page.goto(`${ORIGIN}#/projects`);
      await page.getByRole('link', { name: /وحدة الطاقة/ }).first().click();
      await page.getByRole('button', { name: 'فتح محرر الدرس: مصادر الطاقة' }).click();
      await page.getByTestId('lesson-to-library').click();
      await page.getByTestId('library-title').fill('قالب من 0.6');
      await page.getByTestId('library-save').click();
      await expect(page.getByTestId('library-save-dialog')).toBeHidden();
      await page.goto(`${ORIGIN}#/library?source=mine`);
      await expect(page.locator('[data-testid="library-item"][data-title="قالب من 0.6"]')).toBeVisible();
      // a full backup of the upgraded device holds the old lesson, the old design and the new template
      await page.goto(`${ORIGIN}#/backup`);
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('create-backup').click()]);
      const zip = unzipSync(new Uint8Array(readFileSync(await dl.path())));
      const manifest = JSON.parse(strFromU8(zip['manifest.json']));
      const data = JSON.parse(strFromU8(zip['data.json']));
      expect(manifest.kind).toBe('backup');
      expect(manifest.schemaVersion).toBe(7);
      expect(data.lessons.map((l: { title: string }) => l.title)).toEqual(['مصادر الطاقة']);
      expect(data.designs.map((d: { title: string }) => d.title)).toEqual(['خريطة 0.6']);
      expect(data.library.map((d: { title: string }) => d.title)).toEqual(['قالب من 0.6']);
      await ctx2.close();
    } finally {
      stop(server);
      await waitForPort(true);
    }
  });
  test('a project and a library template made in 0.7.0 survive the update; the demo installs next to them and is removed without touching them', async ({}, info) => {
    test.skip(!['desktop-1440', 'phone-pixel-7'].includes(info.project.name), 'one computer and one phone size');
    const profile = newProfileDir();
    let server: ChildProcess | undefined;
    try {
      // ── 0.7.0: a project with a lesson and an objective, the lesson saved as a template ──
      server = await serve(LEGACY7);
      const ctx1 = await launchProfile(profile, info);
      const p1 = ctx1.pages()[0] ?? (await ctx1.newPage());
      await p1.goto(ORIGIN);
      await p1.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await p1.reload();
      await expect.poll(() => p1.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await skipSplash(p1);
      await p1.goto(`${ORIGIN}#/settings`);
      await expect(p1.locator('.kv dd[dir=ltr]').nth(1)).toHaveText('0.7.0');
      await p1.goto(`${ORIGIN}#/projects`);
      await p1.getByTestId('new-project').click();
      await p1.getByTestId('project-title').fill('وحدة الطاقة');
      await p1.getByTestId('project-save').click();
      await p1.getByTestId('new-lesson').first().click();
      await p1.getByTestId('lesson-title').fill('مصادر الطاقة');
      await p1.getByTestId('lesson-save').click();
      await expect(p1.getByTestId('lesson-dialog')).toBeHidden();
      await p1.getByRole('button', { name: 'فتح محرر الدرس: مصادر الطاقة' }).click();
      await p1.getByTestId('add-objective').click();
      await p1.getByRole('radio', { name: '1 التذكر' }).click();
      await p1.getByTestId('verb-bank').getByRole('button', { name: 'يعدّد', exact: true }).click();
      await p1.getByTestId('objective-content').fill('مصادر الطاقة المتجددة');
      await p1.waitForTimeout(150);
      await expect(p1.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
      await p1.getByTestId('lesson-to-library').click();
      await p1.getByTestId('library-title').fill('قالب من 0.7');
      await p1.getByTestId('library-save').click();
      await expect(p1.getByTestId('library-save-dialog')).toBeHidden();
      await ctx1.close();
      stop(server);
      await waitForPort(true);

      // ── current version ──
      server = await serve(ROOT);
      const ctx2 = await launchProfile(profile, info);
      const page = ctx2.pages()[0] ?? (await ctx2.newPage());
      await page.goto(ORIGIN);
      await skipSplash(page);
      await expect(page.getByText('يتوفر إصدار أحدث من التطبيق.')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: 'تحديث الآن' }).click();
      await page.waitForLoadState('load');
      await skipSplash(page);
      await page.goto(`${ORIGIN}#/settings`);
      await expect(page.locator('.kv dd[dir=ltr]').nth(1)).toHaveText(CURRENT, { timeout: 15_000 });
      await expect(page.locator('.kv dd[dir=ltr]').first()).toContainText('v7'); // phase 7 needed no database change
      // the new logo is served
      expect(await page.evaluate(async () => (await fetch('favicon.svg')).text())).toContain('final, phase 7');
      // add the demo next to the old project
      await page.getByTestId('demo-panel').getByTestId('demo-install').click();
      await expect(page.getByTestId('demo-panel')).toHaveAttribute('data-installed', 'true', { timeout: 15_000 });
      await page.goto(`${ORIGIN}#/projects`);
      await expect(page.getByTestId('project-card')).toHaveCount(2);
      // remove it: the 0.7.0 project, its objective and the template are all still there
      await page.goto(`${ORIGIN}#/settings`);
      await page.getByTestId('demo-remove').click();
      await page.getByTestId('confirm-demo-remove').getByRole('button', { name: 'نعم، احذفه' }).click();
      await expect(page.getByTestId('demo-panel')).toHaveAttribute('data-installed', 'false');
      await page.goto(`${ORIGIN}#/projects`);
      await expect(page.getByTestId('project-card')).toHaveCount(1);
      await page.getByTestId('project-card').click();
      await page.getByRole('button', { name: 'فتح محرر الدرس: مصادر الطاقة' }).click();
      await expect(page.getByTestId('objective-statement')).toHaveText('أن يعدّد الطالب مصادر الطاقة المتجددة.');
      await page.goto(`${ORIGIN}#/library?source=mine`);
      await expect(page.locator('[data-testid="library-item"][data-title="قالب من 0.7"]')).toBeVisible();
      await ctx2.close();
    } finally {
      stop(server);
      await waitForPort(true);
    }
  });
});
