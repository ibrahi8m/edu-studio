import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchProfile, newProfileDir, primeOffline, waitPastSplash, watchNetwork } from './helpers';

const isPhone = (name: string) => name.startsWith('phone');

interface P {
  title: string;
  subject?: string;
  grade?: string;
  status?: string;
  tags?: string;
  description?: string;
}

async function createProject(page: Page, p: P) {
  await page.goto('./#/projects');
  await page.getByTestId('new-project').click();
  const d = page.getByTestId('project-dialog');
  await expect(d).toBeVisible();
  await d.getByTestId('project-title').fill(p.title);
  if (p.subject) await d.getByTestId('project-subject').fill(p.subject);
  if (p.grade) await d.getByTestId('project-grade').selectOption(p.grade);
  if (p.description) await d.getByTestId('project-description').fill(p.description);
  if (p.tags) await d.getByTestId('project-tags').fill(p.tags);
  if (p.status) await d.getByTestId('project-status').selectOption(p.status); // 1.1.0: the dialog has more selects (kind fields)
  await d.getByTestId('project-save').click();
  await expect(page.getByTestId('project-heading')).toHaveText(p.title);
}

async function addLesson(page: Page, title: string, opts: { duration?: string; status?: string; summary?: string } = {}) {
  await page.getByTestId('new-lesson').first().click();
  const d = page.getByTestId('lesson-dialog');
  await expect(d).toBeVisible();
  await d.getByTestId('lesson-title').fill(title);
  if (opts.summary) await d.getByTestId('lesson-summary').fill(opts.summary);
  if (opts.duration) await d.getByTestId('lesson-duration').fill(opts.duration);
  if (opts.status) await d.getByTestId('lesson-status').selectOption(opts.status);
  await d.getByTestId('lesson-save').click();
  await expect(d).toBeHidden();
}

const lessonTitles = (page: Page) => page.getByTestId('project-lessons').locator('.lesson-title').allTextContents();

async function disableSplash(page: Page) {
  await page.goto('./#/settings');
  await waitPastSplash(page);
  await page.getByTestId('toggle-splash').uncheck();
}

test.describe('Phase 1 — projects and lessons', () => {
  test('create, validate, edit and delete a project with its lessons (with undo)', async ({ page }) => {
    await disableSplash(page);
    await page.goto('./#/projects');
    await expect(page.getByTestId('projects-empty')).toBeVisible();

    // Validation: empty title is refused and nothing is saved
    await page.getByTestId('new-project').click();
    await page.getByTestId('project-save').click();
    await expect(page.getByTestId('project-dialog').getByRole('alert')).toHaveText('العنوان مطلوب.');
    await page.getByTestId('project-dialog').getByRole('button', { name: 'إلغاء' }).click();
    await expect(page.getByTestId('projects-empty')).toBeVisible();

    await createProject(page, {
      title: 'وحدة الطاقة ومصادرها',
      subject: 'العلوم',
      grade: 'الصف السابع',
      tags: 'طاقة، بيئة',
      description: 'وحدة عن أشكال الطاقة ومصادرها.',
    });
    await expect(page.getByTestId('lessons-empty')).toBeVisible();

    // Lessons, linked to this project, numbered in order
    await addLesson(page, 'أشكال الطاقة', { duration: '45', status: 'ready' });
    await addLesson(page, 'مصادر الطاقة المتجددة', { duration: '٥٠' }); // Arabic-Indic digits accepted
    await addLesson(page, 'ترشيد الاستهلاك');
    expect(await lessonTitles(page)).toEqual(['أشكال الطاقة', 'مصادر الطاقة المتجددة', 'ترشيد الاستهلاك']);
    await expect(page.getByText('1 س 35 د')).toBeVisible();

    // Invalid duration is refused
    await page.getByTestId('new-lesson').first().click();
    await page.getByTestId('lesson-title').fill('مدة خاطئة');
    await page.getByTestId('lesson-duration').fill('ساعة');
    await page.getByTestId('lesson-save').click();
    await expect(page.getByTestId('lesson-dialog').getByRole('alert')).toBeVisible();
    await page.getByTestId('lesson-dialog').getByRole('button', { name: 'إلغاء' }).click();

    // Reorder
    await page.getByRole('button', { name: 'نقل «ترشيد الاستهلاك» إلى الأعلى' }).click();
    await expect.poll(() => lessonTitles(page)).toEqual(['أشكال الطاقة', 'ترشيد الاستهلاك', 'مصادر الطاقة المتجددة']);
    await expect(page.getByRole('button', { name: 'نقل «أشكال الطاقة» إلى الأعلى' })).toBeDisabled();

    // Edit a lesson
    await page.getByRole('button', { name: 'تعديل بيانات الدرس: ترشيد الاستهلاك' }).click();
    await page.getByTestId('lesson-title').fill('ترشيد استهلاك الطاقة');
    await page.getByTestId('lesson-save').click();
    await expect.poll(() => lessonTitles(page)).toContain('ترشيد استهلاك الطاقة');

    // Delete a lesson, then undo
    await page.getByRole('button', { name: 'تعديل بيانات الدرس: ترشيد استهلاك الطاقة' }).click();
    await page.getByTestId('lesson-delete').click();
    await page.getByTestId('confirm-delete-lesson').getByRole('button', { name: 'حذف الدرس' }).click();
    await expect.poll(() => lessonTitles(page)).toEqual(['أشكال الطاقة', 'مصادر الطاقة المتجددة']);
    await page.getByTestId('toast').getByRole('button', { name: 'تراجع' }).click();
    await expect.poll(() => lessonTitles(page)).toEqual(['أشكال الطاقة', 'ترشيد استهلاك الطاقة', 'مصادر الطاقة المتجددة']);

    // Edit the project
    await page.getByTestId('edit-project').click();
    await page.getByTestId('project-title').fill('وحدة الطاقة المتجددة');
    await page.getByTestId('project-save').click();
    await expect(page.getByTestId('project-heading')).toHaveText('وحدة الطاقة المتجددة');

    // Delete the project → lessons go with it; undo brings both back
    await page.getByTestId('delete-project').click();
    await expect(page.getByTestId('confirm-delete-project')).toContainText('3 دروس');
    await page.getByTestId('confirm-delete-project').getByRole('button', { name: 'حذف المحتوى ودروسه' }).click();
    await expect(page.getByTestId('projects-empty')).toBeVisible();
    await page.getByTestId('toast').getByRole('button', { name: 'تراجع' }).click();
    await expect(page.getByTestId('project-heading')).toHaveText('وحدة الطاقة المتجددة');
    expect(await lessonTitles(page)).toHaveLength(3);

    // Delete for real → no orphan lessons remain
    await page.getByTestId('delete-project').click();
    await page.getByTestId('confirm-delete-project').getByRole('button', { name: 'حذف المحتوى ودروسه' }).click();
    await expect(page.getByTestId('projects-empty')).toBeVisible();
    await page.goto('./');
    await expect(page.getByTestId('stat-projects')).toHaveText('0');
    await expect(page.getByTestId('stat-lessons')).toHaveText('0');
  });

  test('search (Arabic spelling variants), lesson search, classification, sorting, and filters kept in the URL', async ({ page }, info) => {
    await disableSplash(page);
    await createProject(page, { title: 'الطاقة', subject: 'العلوم', grade: 'الصف السابع', tags: 'فيزياء' });
    await addLesson(page, 'تحديد الأهداف في درس الطاقة');
    await createProject(page, { title: 'الشعر الجاهلي', subject: 'اللغة العربية', grade: 'الصف العاشر' });
    await addLesson(page, 'معلقة امرئ القيس', { summary: 'قراءة وتحليل' });
    await createProject(page, { title: 'وحدة قديمة', subject: 'العلوم', status: 'archived' });

    await page.goto('./#/projects');
    const cards = page.getByTestId('project-card');
    await expect(cards).toHaveCount(2); // archived hidden by default

    const search = page.getByTestId('search');
    await search.fill('الاهداف'); // typed without hamza; lesson match finds its project
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('الطاقة');
    await search.fill('أمرئ'); // extra hamza
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('الشعر الجاهلي');
    await search.fill('رياضيات');
    await expect(page.getByTestId('no-results')).toBeVisible();
    await search.fill('');

    if (isPhone(info.project.name)) await page.getByTestId('toggle-filters').click();
    await page.getByTestId('filter-subject').selectOption('العلوم');
    await expect(cards).toHaveCount(1);
    await page.getByTestId('filter-status').selectOption('all');
    await expect(cards).toHaveCount(2);
    await page.getByTestId('filter-status').selectOption('archived');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('وحدة قديمة');

    // Filters survive a reload (kept in the address)
    await page.reload();
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    await expect(page.getByTestId('project-card').first()).toContainText('وحدة قديمة');

    await page.goto('./#/projects?sort=title&status=all');
    await expect(cards.first()).toContainText('الشعر الجاهلي');
    await page.goto('./#/projects?grade=' + encodeURIComponent('الصف العاشر'));
    await expect(cards).toHaveCount(1);

    // Lesson tab: search across all projects, open the result inside its project
    await page.goto('./#/projects?tab=lessons');
    await expect(page.getByTestId('lesson-row')).toHaveCount(2);
    await page.getByTestId('search').fill('تحليل');
    await expect(page.getByTestId('lesson-row')).toHaveCount(1);
    await page.getByTestId('lesson-row').first().locator('.lesson-main').click();
    await expect(page.getByTestId('project-heading')).toHaveText('الشعر الجاهلي');
    await expect(page.locator('.lesson-row.is-highlight')).toContainText('معلقة امرئ القيس');
  });

  test('projects created offline survive a full browser restart offline', async ({}, info) => {
    const dir = newProfileDir();
    const base = String(info.project.use.baseURL);

    const ctx1 = await launchProfile(dir, info);
    const p1 = ctx1.pages()[0] ?? (await ctx1.newPage());
    await primeOffline(p1);
    await waitPastSplash(p1);
    await ctx1.setOffline(true); // everything below is created with no network
    await createProject(p1, { title: 'مشروع أُنشئ دون إنترنت', subject: 'الرياضيات', grade: 'الصف الخامس' });
    await addLesson(p1, 'الكسور العادية', { duration: '40' });
    await addLesson(p1, 'جمع الكسور');
    await ctx1.close();

    const ctx2 = await launchProfile(dir, info);
    await ctx2.setOffline(true);
    const page = ctx2.pages()[0] ?? (await ctx2.newPage());
    const net = watchNetwork(page, base);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('./');
    await waitPastSplash(page);
    await expect(page.getByTestId('stat-projects')).toHaveText('1');
    await expect(page.getByTestId('stat-lessons')).toHaveText('2');
    await page.goto('./#/projects');
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-heading')).toHaveText('مشروع أُنشئ دون إنترنت');
    expect(await lessonTitles(page)).toEqual(['الكسور العادية', 'جمع الكسور']);
    // still editable offline after the restart
    await addLesson(page, 'طرح الكسور');
    await expect.poll(() => lessonTitles(page)).toEqual(['الكسور العادية', 'جمع الكسور', 'طرح الكسور']);
    expect(net.external).toEqual([]);
    expect(net.failed).toEqual([]);
    expect(errors).toEqual([]);
    await ctx2.close();
  });

  test('project screens fit the device, dialogs open as sheets on phones, no a11y violations', async ({ page }, info) => {
    await disableSplash(page);
    await createProject(page, { title: 'عنوان طويل جدًا لمشروع تعليمي يختبر التفاف النص على الشاشات الصغيرة دون أن يخرج عن حدودها', subject: 'العلوم', grade: 'الصف السابع', tags: 'وسم أول، وسم ثانٍ، وسم ثالث' });
    await addLesson(page, 'درس بعنوان طويل كذلك ليختبر الالتفاف داخل صف الدرس على الجوال', { duration: '45', summary: 'ملخص قصير للدرس.' });
    const vw = page.viewportSize()!.width;

    for (const url of ['./#/projects', './#/projects?tab=lessons', page.url(), './']) {
      await page.goto(url);
      await page.waitForTimeout(400);
      const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(scrollW).toBeLessThanOrEqual(vw);
      expect(innerW).toBe(vw);
    }

    await page.goto('./#/projects');
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p1-projects.png`, fullPage: true });
    await page.getByTestId('project-card').first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p1-project.png`, fullPage: true });

    const fab = page.getByTestId('new-lesson').first();
    const box = (await fab.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
    expect(box.height).toBeGreaterThanOrEqual(44);

    await fab.click();
    const dlg = page.getByTestId('lesson-dialog');
    await expect(dlg).toBeVisible();
    const dbox = (await dlg.boundingBox())!;
    if (isPhone(info.project.name)) {
      expect(Math.round(dbox.width)).toBe(vw); // full-width bottom sheet
      expect(Math.round(dbox.y + dbox.height)).toBeGreaterThanOrEqual(page.viewportSize()!.height - 2);
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p1-lesson-dialog.png` });
    const a11yDialog = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const bad = (r: typeof a11yDialog) => r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.target}`);
    expect(bad(a11yDialog)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();

    for (const theme of ['داكن', 'فاتح']) {
      await page.goto('./#/settings');
      await page.getByRole('radio', { name: theme }).click();
      for (const url of ['./#/projects', './#/projects?tab=lessons', './']) {
        await page.goto(url);
        await page.waitForTimeout(350);
        expect(bad(await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()), `${theme} ${url}`).toEqual([]);
      }
    }
  });
});
