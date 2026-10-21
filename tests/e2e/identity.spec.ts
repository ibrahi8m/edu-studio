import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchProfile, newProfileDir, primeOffline, watchNetwork } from './helpers';
import { chooseStudent, disableSplash, isPhone } from './quiz-helpers';

/**
 * Phase 7 — identity and demo content.
 * Plan acceptance: a visual review on several screen sizes, contrast and accessibility checks;
 * final checklist item: «المحتوى التجريبي يُحمَّل ويعرض بطاقة القرار التربوي».
 */

const DEMO = 'demo-project-digital-safety';

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);

async function fits(page: Page, label: string) {
  const vw = page.viewportSize()!.width;
  const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollW, `horizontal overflow: ${label}`).toBeLessThanOrEqual(vw);
  expect(innerW, `zoomed out: ${label}`).toBe(vw);
}

async function installFromSettings(page: Page) {
  await page.goto('./#/settings#demo');
  await expect(page.getByTestId('demo-panel')).toHaveAttribute('data-installed', 'false');
  await page.getByTestId('demo-panel').getByTestId('demo-install').click();
  await expect(page.getByTestId('demo-panel')).toHaveAttribute('data-installed', 'true', { timeout: 15_000 });
}

/** The teacher's own project, made before the demo arrives. */
async function myProject(page: Page) {
  await page.goto('./#/projects');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-title').fill('مشروعي الحقيقي');
  await page.getByTestId('project-save').click();
  await expect(page.getByTestId('project-heading')).toHaveText('مشروعي الحقيقي');
  await page.getByTestId('new-lesson').first().click();
  await page.getByTestId('lesson-title').fill('درسي');
  await page.getByTestId('lesson-save').click();
  await expect(page.getByTestId('lesson-dialog')).toBeHidden();
}

const counts = (page: Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok, fail) => {
      const r = indexedDB.open('ibrahi8m-edu');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
    const out: Record<string, number> = {};
    for (const s of ['projects', 'lessons', 'lessonDocs', 'assets', 'quizzes', 'attempts', 'progress', 'designs']) {
      out[s] = await new Promise((ok) => {
        const r = db.transaction(s).objectStore(s).count();
        r.onsuccess = () => ok(r.result);
      });
    }
    db.close();
    return out;
  });

test.describe('Phase 7 — identity and demo content', () => {
  test('ACCEPTANCE: the demo project installs offline, shows the pedagogical decision card, fills results and student mode, and is removed without touching the teacher’s data', async ({}, testInfo) => {
    test.setTimeout(240_000);
    const base = String(testInfo.project.use.baseURL);
    const ctx = await launchProfile(newProfileDir(), testInfo);
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await primeOffline(page);
    await disableSplash(page);
    await ctx.setOffline(true);
    const net = watchNetwork(page, base);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await myProject(page);
    const mine = await counts(page);
    expect(mine).toMatchObject({ projects: 1, lessons: 1 });
    // the teacher's own project: no demo badge
    await page.goto('./#/projects');
    await expect(page.getByTestId('project-card').filter({ hasText: 'مشروعي الحقيقي' }).getByTestId('demo-badge')).toHaveCount(0);

    // add the demo (offline: its pictures come from the app itself)
    await installFromSettings(page);
    const withDemo = await counts(page);
    expect(withDemo.projects).toBe(2);
    expect(withDemo.lessons).toBe(4);
    expect(withDemo.assets).toBe(3);
    expect(withDemo.quizzes).toBe(3);
    expect(withDemo.designs).toBe(3);
    expect(withDemo.attempts).toBeGreaterThanOrEqual(28);
    // no second copy
    await expect(page.getByTestId('demo-panel').getByTestId('demo-install')).toHaveCount(0);

    // clearly marked: badge on its card, banner inside
    await page.goto('./#/projects');
    await expect(page.getByTestId('project-card').filter({ hasText: 'وحدة الأمن الرقمي' }).getByTestId('demo-badge')).toBeVisible();
    await page.getByTestId('project-card').filter({ hasText: 'وحدة الأمن الرقمي' }).click();
    await expect(page.getByTestId('demo-banner')).toBeVisible();
    await expect(page.getByTestId('lesson-row')).toHaveCount(3);
    expect(await serious(page)).toEqual([]);
    await fits(page, 'demo project');

    // the pedagogical decision card in the lesson preview, and the lesson picture
    await page.goto(`./#/preview/demo-lesson-1`);
    await page.getByTestId('toggle-teacher-notes').click();
    const card = page.getByTestId('teacher-panel');
    await expect(card).toContainText('لماذا صُمم الدرس هكذا؟');
    await expect(card).toContainText('الاستقصاء');
    await expect(card).toContainText('مختبر كلمات المرور');
    await expect.poll(() => page.locator('img[alt^="قفل أزرق"]').evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBe(960);
    expect(await serious(page)).toEqual([]);
    await fits(page, 'preview');

    // the alignment matrix shows every objective covered
    await page.goto(`./#/projects/${DEMO}/lessons/demo-lesson-2`);
    await expect(page.getByTestId('lesson-title-field')).toHaveValue('التصيّد الاحتيالي: كيف تكشف الرسائل المزيفة؟');
    await page.getByTestId('tab-alignment').click();
    await expect(page.getByTestId('coverage-row')).toHaveCount(4);
    for (const st of await page.getByTestId('coverage-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))) expect(st).toBe('covered');

    // results: three quizzes, ten students, one answer waiting for the teacher
    await page.goto('./#/results');
    await expect(page.getByTestId('results-row')).toHaveCount(3);
    await expect(page.getByTestId('student-row')).toHaveCount(10);
    await page.goto('./#/results/demo-quiz-2');
    await expect(page.getByTestId('quiz-student-row')).toHaveCount(10);
    await expect(page.getByTestId('review-queue')).toContainText('(1)');
    expect(await serious(page)).toEqual([]);
    await fits(page, 'quiz results');

    // student mode: a demo student sees her finished lessons
    await chooseStudent(page, 'سارة');
    const lesson = page.locator('[data-testid="learn-lesson"][data-lesson="كلمات المرور القوية والتحقق بخطوتين"]');
    await expect(lesson.getByTestId('lesson-progress-text')).toContainText('أكملت');
    await expect(page.getByTestId('learn-project').filter({ hasText: 'وحدة الأمن الرقمي' }).getByTestId('demo-badge')).toBeVisible();

    // the teacher edits inside the demo, then removes it: everything of the demo goes, nothing of hers
    await page.goto(`./#/projects/${DEMO}`);
    await page.getByTestId('new-lesson').first().click();
    await page.getByTestId('lesson-title').fill('درس أضفته في التجريبي');
    await page.getByTestId('lesson-save').click();
    await expect(page.getByTestId('lesson-dialog')).toBeHidden();
    await page.getByTestId('demo-banner').getByRole('link', { name: 'الإعدادات' }).click();
    await expect(page.getByTestId('settings-demo')).toBeInViewport();
    await page.getByTestId('demo-remove').click();
    const dlg = page.getByTestId('confirm-demo-remove');
    await expect(dlg).toContainText('وأي شيء أضفته أنت داخله');
    await dlg.getByRole('button', { name: 'إلغاء' }).click();
    expect((await counts(page)).projects).toBe(2); // cancelling changes nothing
    await page.getByTestId('demo-remove').click();
    await dlg.getByRole('button', { name: 'نعم، احذفه' }).click();
    await expect(page.getByTestId('demo-panel')).toHaveAttribute('data-installed', 'false');
    expect(await counts(page)).toEqual(mine);
    await page.goto('./#/projects');
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    await expect(page.getByTestId('project-card')).toContainText('مشروعي الحقيقي');
    await page.goto('./#/results');
    await expect(page.getByTestId('results-row')).toHaveCount(0);

    expect(net.external).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('demo from the empty dashboard; reset puts it back as it was; the backup reminder ignores it; the demo survives a restart', async ({}, testInfo) => {
    test.setTimeout(180_000);
    const dir = newProfileDir();
    const ctx = await launchProfile(dir, testInfo);
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await disableSplash(page);
    await page.goto('./#/');
    await page.getByTestId('demo-install').click();
    await page.getByTestId('toast').getByRole('button', { name: 'فتح' }).click();
    await expect(page.getByTestId('project-heading')).toHaveText('وحدة الأمن الرقمي');
    // only demo data on the device: no «no backup yet» warning
    await page.goto('./#/');
    await expect(page.getByTestId('recent-projects')).toContainText('وحدة الأمن الرقمي');
    await expect(page.getByTestId('dashboard-backup-due')).toHaveCount(0);
    await expect(page.getByTestId('demo-install')).toHaveCount(0);

    // change something inside the demo, then reset it
    await page.goto(`./#/projects/${DEMO}/lessons/demo-lesson-1`);
    await page.getByTestId('lesson-title-field').fill('عنوان عدّلته');
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
    await page.goto('./#/settings');
    await page.getByTestId('demo-reset').click();
    await page.getByTestId('confirm-demo-reset').getByRole('button', { name: 'نعم، أعِده' }).click();
    await expect(page.getByTestId('toast').filter({ hasText: 'أُعيد المشروع التجريبي' })).toBeVisible();
    await page.goto(`./#/projects/${DEMO}`);
    await expect(page.getByText('كلمات المرور القوية والتحقق بخطوتين').first()).toBeVisible();
    await expect(page.getByText('عنوان عدّلته')).toHaveCount(0);
    const before = await counts(page);
    await ctx.close();

    const ctx2 = await launchProfile(dir, testInfo);
    const p2 = ctx2.pages()[0] ?? (await ctx2.newPage());
    await p2.goto(`./#/projects/${DEMO}`);
    await expect(p2.getByTestId('lesson-row')).toHaveCount(3);
    expect(await counts(p2)).toEqual(before);
    await ctx2.close();
  });

  test('VISUAL REVIEW: every main screen with the demo content, in dark and light themes — no serious accessibility or contrast violation, nothing wider than the screen', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await disableSplash(page);
    await installFromSettings(page);
    const screens: [string, string, string][] = [
      ['dashboard', '/', 'page-dashboard'],
      ['projects', '/projects', 'page-projects'],
      ['project', `/projects/${DEMO}`, 'page-project'],
      ['lesson-plan', `/projects/${DEMO}/lessons/demo-lesson-1`, 'page-editor'],
      ['lesson-content', `/projects/${DEMO}/lessons/demo-lesson-1?tab=content`, 'page-editor'],
      ['preview', '/preview/demo-lesson-2?notes=1', 'teacher-panel'],
      ['studio', '/studio', 'design-list'],
      ['map', '/studio/demo-design-1', 'page-design-editor'],
      ['cards', '/studio/demo-design-2', 'page-design-editor'],
      ['quizzes', '/quizzes', 'page-quizzes'],
      ['quiz-editor', '/quizzes/demo-quiz-3', 'page-quiz-editor'],
      ['results', '/results', 'page-results'],
      ['quiz-results', '/results/demo-quiz-1', 'page-quiz-results'],
      ['library', '/library', 'page-library'],
      ['backup', '/backup', 'page-backup'],
      ['settings', '/settings', 'page-settings'],
      ['about', '/about', 'page-about'],
    ];
    const problems: string[] = [];
    for (const theme of ['ليلي', 'نهاري']) { // 1.2.0 labels (were داكن/فاتح)
      await page.goto('./#/settings');
      await page.getByRole('radio', { name: theme }).click();
      for (const [name, url, id] of screens) {
        await page.goto(`./#${url}`);
        await expect(page.getByTestId(id).first(), name).toBeVisible();
        await page.waitForTimeout(500); // longest entrance (staggered cards) is 120 + 240 ms: colours are final after it
        for (const v of await serious(page)) problems.push(`${theme} ${name}: ${v}`);
        await fits(page, `${theme} ${name}`);
        if (theme === 'داكن' && ['dashboard', 'project', 'preview', 'quiz-results', 'about'].includes(name))
          await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}/p7-${name}.png` });
      }
    }
    expect(problems).toEqual([]);

    // student mode and a student report, too
    await chooseStudent(page, 'يوسف');
    expect(await serious(page)).toEqual([]);
    await fits(page, 'learn');
    await page.locator('[data-testid="learn-lesson"][data-lesson="بصمتي الرقمية وخصوصيتي"]').getByTestId('open-lesson').click();
    await expect(page.getByTestId('lp-part')).toBeVisible();
    expect(await serious(page)).toEqual([]);
    await fits(page, 'lesson player');
    await page.goto('./#/results');
    await page.getByTestId('student-row').filter({ hasText: 'ليان' }).getByRole('link').click();
    await expect(page.getByTestId('page-student-report')).toBeVisible();
    expect(await serious(page)).toEqual([]);
    await fits(page, 'student report');
  });

  test('final logo everywhere: app icons, sidebar or top bar, splash, about; the wordmark reads «IBRAHI8M»', async ({ page }, testInfo) => {
    await page.goto('./');
    const splash = page.getByTestId('splash');
    await expect(splash).toBeVisible();
    await expect(splash.locator('img.brand-glyph')).toBeVisible();
    await expect(splash.getByRole('img', { name: 'IBRAHI8M' })).toBeVisible();
    await page.getByRole('button', { name: 'تخطي' }).click();
    // favicon and manifest icons are the new mark
    expect(await page.locator('link[rel="icon"]').first().getAttribute('href')).toContain('favicon.svg');
    const fav = await page.evaluate(async () => (await fetch('favicon.svg')).text());
    expect(fav).toContain('IBRAHI8M app icon (final, phase 7)');
    const manifest = await page.evaluate(async () => {
      const href = document.querySelector('link[rel="manifest"]')!.getAttribute('href')!;
      return (await fetch(href)).json();
    });
    for (const icon of manifest.icons as { src: string }[]) {
      const size = await page.evaluate(async (src) => {
        const b = await (await fetch(src)).blob();
        const bmp = await createImageBitmap(b);
        return [bmp.width, bmp.height];
      }, icon.src);
      expect(size[0]).toBeGreaterThanOrEqual(192);
    }
    // the shell shows the mark (sidebar on computers and tablets, top bar on phones)
    const mark = page.locator('img.brand-mark:visible').first();
    await expect(mark).toBeVisible();
    expect(await mark.getAttribute('src')).toContain('brand/ibrahi8m-mark.svg');
    await expect.poll(() => mark.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    // the wordmark is one word for screen readers, its 8 is drawn
    const wm = page.getByRole('img', { name: 'IBRAHI8M' }).first();
    await expect(wm).toBeVisible();
    await expect(wm.locator('svg.wordmark-eight')).toHaveCount(1);
    await page.goto('./#/about');
    await expect(page.getByTestId('about-identity').locator('img.brand-glyph')).toBeVisible();
    await expect(page.getByTestId('about-version')).toHaveText(/^\d+\.\d+\.\d+$/);
    // every link in the «pedagogical basis» card leads to a real page
    const links = page.getByTestId('principle-link');
    const n = await links.count();
    expect(n).toBe(8);
    for (let i = 0; i < n; i++) {
      await page.goto('./#/about');
      const href = await links.nth(i).getAttribute('href');
      await links.nth(i).click();
      await expect(page.locator('[data-testid^="page-"]').first(), String(href)).toBeVisible();
      await expect(page.getByText('الصفحة غير موجودة')).toHaveCount(0);
    }
    void testInfo;
  });

  // 1.2.0: the «تقليل الحركة» switch became the «مستوى الحركة» choice; «إيقاف كل الحركة» is what the switch did.
  test('motion: short entrances by default; «إيقاف كل الحركة» (and the system setting) turn them off and it survives reopening', async ({ page }, testInfo) => {
    await disableSplash(page);
    const duration = () => page.evaluate(() => getComputedStyle(document.querySelector('.page')!).animationDuration);
    await page.goto('./#/projects');
    expect(await duration()).toBe('0.26s');
    await page.goto('./#/settings');
    await page.getByRole('radio', { name: 'إيقاف كل الحركة' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe('reduce');
    await page.goto('./#/projects');
    expect(await duration()).toBe('0.001s');
    await page.reload();
    expect(await duration()).toBe('0.001s');
    await page.goto('./#/settings');
    await page.getByRole('radio', { name: 'حركة هادئة' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe('system');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./#/settings');
    await expect(page.getByTestId('motion-system-note')).toBeVisible();
    await page.goto('./#/projects');
    expect(await duration()).toBe('0.001s');
    void testInfo;
  });

  test('settings reset asks in the app’s own dialog (no browser pop-up) and keeps projects', async ({ page }) => {
    await disableSplash(page);
    await myProject(page);
    await page.goto('./#/settings');
    await page.getByRole('radio', { name: 'نهاري' }).click();
    let popup = false;
    page.on('dialog', async (d) => {
      popup = true;
      await d.dismiss();
    });
    await page.getByTestId('settings-reset').click();
    const dlg = page.getByTestId('confirm-settings-reset');
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: 'نعم، أعِدها' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    expect(popup).toBe(false);
    await page.goto('./#/projects');
    await expect(page.getByTestId('project-card')).toHaveCount(1);
  });
});

test('phones: the demo lesson works by touch in student mode', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'phone sizes only');
  await disableSplash(page);
  await installFromSettings(page);
  await chooseStudent(page, 'زائر');
  await page.locator('[data-testid="learn-lesson"][data-lesson="التصيّد الاحتيالي: كيف تكشف الرسائل المزيفة؟"]').getByTestId('open-lesson').tap();
  await expect(page.getByTestId('lp-part')).toHaveAttribute('data-section', 'intro');
  await page.getByTestId('lp-next').tap();
  await expect(page.getByTestId('lp-part')).toHaveAttribute('data-section', 'content');
  await expect(page.locator('.lp-part img').first()).toBeVisible();
  await fits(page, 'lesson player phone');
});
