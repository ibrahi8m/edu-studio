import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { launchProfile, newProfileDir, primeOffline, settleAfterAdd, waitPastSplash, watchNetwork } from './helpers';

const FX = (f: string) => fileURLToPath(new URL(`../fixtures/${f}`, import.meta.url));
const isPhone = (name: string) => name.startsWith('phone');

async function disableSplash(page: Page) {
  await page.goto('./#/settings');
  await waitPastSplash(page);
  await page.getByTestId('toggle-splash').uncheck();
}

/** Creates a project and a lesson through the UI and opens the lesson editor. */
async function newLessonInEditor(page: Page, lessonTitle = 'مصادر الطاقة المتجددة') {
  await page.goto('./#/projects');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-title').fill('وحدة الطاقة');
  await page.getByTestId('project-subject').fill('العلوم');
  await page.getByTestId('project-grade').selectOption('الصف السابع');
  await page.getByTestId('project-save').click();
  await expect(page.getByTestId('project-heading')).toHaveText('وحدة الطاقة');
  await page.getByTestId('new-lesson').first().click();
  await page.getByTestId('lesson-title').fill(lessonTitle);
  await page.getByTestId('lesson-save').click();
  await expect(page.getByTestId('lesson-dialog')).toBeHidden();
  await page.getByRole('button', { name: `فتح محرر الدرس: ${lessonTitle}` }).click();
  await expect(page.getByTestId('page-editor')).toBeVisible();
  await expect(page.getByTestId('lesson-title-field')).toHaveValue(lessonTitle);
}

async function waitSaved(page: Page) {
  await page.waitForTimeout(120);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
}

async function addObjective(page: Page, o: { level?: string; verb: string; content: string; criterion?: string; viaBank?: boolean }) {
  await page.getByTestId('add-objective').click();
  const card = page.getByTestId('objective').last();
  if (o.level) await card.getByRole('radio', { name: o.level }).click();
  if (o.viaBank) await card.getByTestId('verb-bank').getByRole('button', { name: o.verb, exact: true }).click();
  else await card.getByTestId('objective-verb').fill(o.verb);
  await card.getByTestId('objective-content').fill(o.content);
  if (o.criterion) await card.getByTestId('objective-criterion').fill(o.criterion);
  return card;
}

async function addBlock(page: Page, type: string) {
  await page.getByTestId('add-block').last().click();
  await page.getByTestId(`add-${type}`).click();
  await expect(page.getByTestId('add-block-dialog')).toBeHidden();
  await settleAfterAdd(page);
}

const blockTypes = (page: Page) => page.getByTestId('block').evaluateAll((els) => els.map((e) => e.getAttribute('data-type')));

test.describe('Phase 2 — lesson editor', () => {
  test.beforeEach(async ({ page }) => {
    await disableSplash(page);
  });

  test('objectives with the Bloom verb bank, strategy and assessment are autosaved and reopen intact', async ({ page }) => {
    await newLessonInEditor(page);
    await expect(page.getByTestId('objectives-empty')).toBeVisible();

    // Objective 1 from the verb bank
    const o1 = await addObjective(page, { level: '1 التذكر', verb: 'يعدّد', viaBank: true, content: 'ثلاثة مصادر للطاقة المتجددة', criterion: 'دون أخطاء' });
    await expect(o1.getByTestId('objective-statement')).toHaveText('أن يعدّد الطالب ثلاثة مصادر للطاقة المتجددة دون أخطاء.');

    // A non-measurable verb is flagged; a bank verb sets its level automatically
    const o2 = await addObjective(page, { verb: 'يفهم', content: 'الفرق بين نوعي الطاقة' });
    await expect(o2.getByTestId('objective-checks')).toContainText('حالة داخلية');
    await o2.getByTestId('objective-verb').fill('يقارن');
    await expect(o2.locator('.objective-meta .bloom-tag')).toHaveText('التحليل');
    await o2.getByTestId('objective-content').fill('بين الطاقة المتجددة وغير المتجددة');

    // Strategy and assessment
    await page.getByTestId('strategy-chips').getByRole('button', { name: 'التعلم التعاوني' }).click();
    await page.getByTestId('strategy-notes').fill('يتيح تبادل الخبرات حول مصادر الطاقة في البيئة المحلية.');
    await page.getByTestId('assessment-types').getByRole('button', { name: 'تكويني' }).click();
    await page.getByTestId('assessment-tools').getByRole('button', { name: 'بطاقة خروج' }).click();
    await page.getByTestId('assessment-notes').fill('بطاقة خروج من ثلاثة أسئلة في آخر خمس دقائق.');
    await page.getByTestId('lesson-summary-field').fill('درس عن مصادر الطاقة المتجددة.');
    await page.getByTestId('lesson-duration-field').fill('45');
    await waitSaved(page);

    // Reopen: everything is read back from the local database
    await page.reload();
    await expect(page.getByTestId('page-editor')).toBeVisible();
    const statements = page.getByTestId('objective-statement');
    await expect(statements).toHaveText([
      'أن يعدّد الطالب ثلاثة مصادر للطاقة المتجددة دون أخطاء.',
      'أن يقارن الطالب بين الطاقة المتجددة وغير المتجددة.',
    ]);
    await expect(page.getByTestId('strategy-chips').getByRole('button', { name: 'التعلم التعاوني' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('assessment-tools').getByRole('button', { name: 'بطاقة خروج' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('strategy-notes')).toHaveValue('يتيح تبادل الخبرات حول مصادر الطاقة في البيئة المحلية.');
    await expect(page.getByTestId('lesson-duration-field')).toHaveValue('45');
    await expect(page.getByTestId('bloom-distribution')).toBeVisible();

    // An empty title is never saved; fixing it saves again
    await page.getByTestId('lesson-title-field').fill('');
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'invalid', { timeout: 10_000 });
    await page.getByTestId('lesson-title-field').fill('الطاقة المتجددة ومصادرها');
    await waitSaved(page);

    // Title change shows on the project page
    await page.getByRole('link', { name: 'وحدة الطاقة' }).click();
    await expect(page.getByTestId('project-lessons')).toContainText('الطاقة المتجددة ومصادرها');

    // Deleting an objective can be undone
    await page.getByRole('button', { name: 'فتح محرر الدرس: الطاقة المتجددة ومصادرها' }).click();
    await page.getByRole('button', { name: 'حذف الهدف 1' }).click();
    await expect(page.getByTestId('objective')).toHaveCount(1);
    await page.getByTestId('toast').getByRole('button', { name: 'تراجع' }).click();
    await expect(page.getByTestId('objective')).toHaveCount(2);
    await expect(statements.first()).toContainText('يعدّد');
  });

  test('content blocks can be added, edited, reordered, duplicated and deleted; order survives a reload', async ({ page }) => {
    await newLessonInEditor(page);
    await page.getByTestId('tab-content').click();
    await expect(page.getByTestId('blocks-empty')).toBeVisible();

    await addBlock(page, 'heading');
    await page.getByTestId('heading-text').last().fill('ما الطاقة المتجددة؟');
    await addBlock(page, 'text');
    await page.getByTestId('text-body').last().fill('الطاقة المتجددة **لا تنفد**.\n\n- الشمس\n- الرياح');
    await addBlock(page, 'summary');
    await page.getByTestId('summary-title').last().fill('أهم المصادر');
    await page.getByTestId('point-title').nth(0).fill('الشمس');
    await addBlock(page, 'cards');
    await page.getByTestId('card-front').nth(0).fill('طاقة متجددة');
    await page.getByTestId('card-back').nth(0).fill('طاقة لا تنفد');
    await page.getByTestId('add-card').click();
    await expect(page.getByTestId('card-edit')).toHaveCount(3);
    await addBlock(page, 'activity');
    await page.getByTestId('activity-title').last().fill('صنّف مصادر الطاقة');
    await page.getByTestId('activity-steps').last().fill('اقرأ البطاقات\nصنّفها في جدول');
    await page.getByTestId('activity-grouping').last().selectOption('pairs');
    expect(await blockTypes(page)).toEqual(['heading', 'text', 'summary', 'cards', 'activity']);

    // Insert in the middle with the inserter of block 1
    await page.getByRole('button', { name: 'إضافة كتلة بعد عنوان 1' }).click();
    await page.getByTestId('add-text').click();
    expect(await blockTypes(page)).toEqual(['heading', 'text', 'text', 'summary', 'cards', 'activity']);
    await page.getByRole('button', { name: 'حذف نص 2' }).click();
    expect(await blockTypes(page)).toEqual(['heading', 'text', 'summary', 'cards', 'activity']);

    // Reorder: activity moves up twice
    await page.getByRole('button', { name: 'نقل نشاط تعليمي 5 إلى الأعلى' }).click();
    await page.getByRole('button', { name: 'نقل نشاط تعليمي 4 إلى الأعلى' }).click();
    expect(await blockTypes(page)).toEqual(['heading', 'text', 'activity', 'summary', 'cards']);
    await expect(page.getByRole('button', { name: 'نقل عنوان 1 إلى الأعلى' })).toBeDisabled();

    // Duplicate and delete with undo
    await page.getByRole('button', { name: 'نسخ ملخص بصري 4' }).click();
    expect(await blockTypes(page)).toEqual(['heading', 'text', 'activity', 'summary', 'summary', 'cards']);
    await page.getByRole('button', { name: 'حذف ملخص بصري 5' }).click();
    await page.getByRole('button', { name: 'حذف نص 2' }).click();
    expect(await blockTypes(page)).toEqual(['heading', 'activity', 'summary', 'cards']);
    await page.getByTestId('toast').getByRole('button', { name: 'تراجع' }).click();
    expect(await blockTypes(page)).toEqual(['heading', 'text', 'activity', 'summary', 'cards']);
    await waitSaved(page);

    // After reload: same order and same content
    await page.reload();
    await page.getByTestId('tab-content').click();
    expect(await blockTypes(page)).toEqual(['heading', 'text', 'activity', 'summary', 'cards']);
    await expect(page.getByTestId('heading-text')).toHaveValue('ما الطاقة المتجددة؟');
    await expect(page.getByTestId('text-body')).toHaveValue('الطاقة المتجددة **لا تنفد**.\n\n- الشمس\n- الرياح');
    await expect(page.getByTestId('activity-title')).toHaveValue('صنّف مصادر الطاقة');
    await expect(page.getByTestId('activity-grouping')).toHaveValue('pairs');
    await expect(page.getByTestId('card-edit')).toHaveCount(3);
  });

  test('alignment matrix flags uncovered objectives and updates as blocks are linked', async ({ page }, info) => {
    await newLessonInEditor(page);
    await page.getByTestId('tab-alignment').click();
    await expect(page.getByTestId('alignment-empty')).toBeVisible();
    await page.getByTestId('tab-plan').click();
    await addObjective(page, { level: '1 التذكر', verb: 'يعدّد', viaBank: true, content: 'مصادر الطاقة', criterion: 'دون أخطاء' });
    await addObjective(page, { level: '4 التحليل', verb: 'يقارن', viaBank: true, content: 'بين نوعي الطاقة', criterion: 'بدقة' });
    await page.getByTestId('tab-content').click();
    await addBlock(page, 'text');
    await page.getByTestId('text-body').fill('شرح');
    await addBlock(page, 'activity');
    await page.getByTestId('activity-title').fill('نشاط');

    // Both objectives start uncovered; the tab shows the count
    await expect(page.getByTestId('tab-alignment').locator('.tab-count-alert')).toHaveText('2');
    await page.getByTestId('tab-alignment').click();
    await expect(page.getByTestId('alignment-alert')).toContainText('الهدف 1، 2');
    const rows = page.getByTestId('coverage-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAttribute('data-status', 'uncovered');
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p2-alignment-alert.png`, fullPage: true });

    // Objective 1 → text = partial, + activity = covered
    await rows.nth(0).getByTestId('matrix-cell').nth(0).click();
    await expect(rows.nth(0)).toHaveAttribute('data-status', 'partial');
    await rows.nth(0).getByTestId('matrix-cell').nth(1).click();
    await expect(rows.nth(0)).toHaveAttribute('data-status', 'covered');
    await expect(page.getByTestId('alignment-alert')).toContainText('هدف غير مغطى: الهدف 2');

    // Objective 2 linked from the block itself (content tab)
    await page.getByTestId('tab-content').click();
    await page.getByTestId('block').nth(1).getByTestId('block-link').click();
    await page.getByTestId('link-dialog').getByTestId('link-checkbox').nth(1).check();
    await page.getByTestId('link-done').click();
    await expect(page.getByTestId('block').nth(1).getByTestId('block-link')).toContainText('الأهداف 1، 2');
    await page.getByTestId('tab-alignment').click();
    await expect(page.getByTestId('alignment-alert')).toHaveCount(0);
    await expect(rows.nth(1)).toHaveAttribute('data-status', 'partial');
    await expect(page.getByTestId('alignment-partial')).toContainText('الهدف 2');
    await waitSaved(page);

    // Links persist
    await page.reload();
    await expect(page.getByTestId('coverage-row').nth(0)).toHaveAttribute('data-status', 'covered');
    await expect(page.getByTestId('coverage-row').nth(1)).toHaveAttribute('data-status', 'partial');
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p2-alignment.png`, fullPage: true });

    // Deleting an objective removes its row and its links
    await page.getByTestId('tab-plan').click();
    await page.getByRole('button', { name: 'حذف الهدف 2' }).click();
    await page.getByTestId('tab-alignment').click();
    await expect(page.getByTestId('coverage-row')).toHaveCount(1);
    await expect(page.getByTestId('alignment-ok')).toBeVisible();
  });

  test('student preview renders the lesson correctly and fits the screen; no accessibility violations', async ({ page }, info) => {
    await newLessonInEditor(page);
    await addObjective(page, { level: '1 التذكر', verb: 'يعدّد', viaBank: true, content: 'ثلاثة مصادر للطاقة', criterion: 'دون أخطاء' });
    await page.getByTestId('strategy-chips').getByRole('button', { name: 'التعلم بالاكتشاف' }).click();
    await page.getByTestId('tab-content').click();
    await addBlock(page, 'heading');
    await page.getByTestId('heading-text').fill('ما الطاقة المتجددة؟');
    await addBlock(page, 'text');
    await page.getByTestId('text-body').fill('الطاقة المتجددة **لا تنفد** أبدًا.\n\n- الشمس\n- الرياح\n- المياه');
    await addBlock(page, 'image');
    await page.getByTestId('image-input').setInputFiles(FX('energy-diagram.png'));
    await expect(page.getByTestId('image-preview')).toBeVisible();
    await page.getByTestId('image-alt').fill('رسم يوضح الشمس والألواح الشمسية');
    await addBlock(page, 'summary');
    await page.getByTestId('summary-title').fill('ثلاثة مصادر');
    await page.getByRole('radio', { name: 'خطوات متسلسلة' }).click();
    await page.getByTestId('point-title').nth(0).fill('الشمس');
    await page.getByTestId('point-title').nth(1).fill('الرياح');
    await addBlock(page, 'cards');
    await page.getByTestId('card-front').nth(0).fill('توربين');
    await page.getByTestId('card-back').nth(0).fill('يحوّل حركة الرياح إلى كهرباء');
    await addBlock(page, 'activity');
    await page.getByTestId('activity-title').fill('صنّف المصادر');
    await page.getByTestId('activity-steps').fill('اقرأ\nصنّف\nناقش');
    await page.getByTestId('activity-duration').fill('10');

    // a11y of the three editor tabs
    const serious = async () =>
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
    expect(await serious(), 'content tab').toEqual([]);
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p2-content.png`, fullPage: true });
    await page.getByTestId('tab-plan').click();
    await page.waitForTimeout(250);
    expect(await serious(), 'plan tab').toEqual([]);
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p2-plan.png`, fullPage: true });
    await page.getByTestId('tab-alignment').click();
    await page.waitForTimeout(250);
    expect(await serious(), 'alignment tab').toEqual([]);

    // Preview (saves first)
    await page.getByTestId('open-preview').click();
    await expect(page.getByTestId('page-preview')).toBeVisible();
    const view = page.getByTestId('lesson-view');
    await expect(view.getByTestId('lv-title')).toHaveText('مصادر الطاقة المتجددة');
    await expect(view.locator('.lv-objectives li')).toHaveText('أن يعدّد الطالب ثلاثة مصادر للطاقة دون أخطاء.');
    await expect(view.locator('h2.lv-h2')).toHaveText('ما الطاقة المتجددة؟');
    await expect(view.locator('.rich-text strong')).toHaveText('لا تنفد');
    await expect(view.locator('.rich-text ul li')).toHaveText(['الشمس', 'الرياح', 'المياه']);
    const img = view.getByTestId('lv-image');
    await expect(img).toHaveAttribute('alt', 'رسم يوضح الشمس والألواح الشمسية');
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1600); // 2400 px source downscaled
    await expect(view.locator('.lv-summary-steps li')).toHaveCount(2);
    const card = view.getByTestId('flip-card').first();
    await expect(card).toHaveAttribute('aria-pressed', 'false');
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(view.locator('.lv-steps li')).toHaveCount(3);
    await view.locator('.step-btn').first().click();
    await expect(view.locator('.step-btn').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(view.getByTestId('teacher-panel')).toHaveCount(0);
    await page.getByTestId('toggle-teacher-notes').click();
    await expect(view.getByTestId('teacher-panel')).toContainText('التعلم بالاكتشاف');

    const vw = page.viewportSize()!.width;
    const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scrollW).toBeLessThanOrEqual(vw);
    expect(innerW).toBe(vw);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p2-preview.png`, fullPage: true });
    expect(await serious(), 'preview').toEqual([]);

    if (!isPhone(info.project.name) && vw >= 768) {
      // Phone frame on a computer: the lesson reflows to a phone layout inside it
      await page.getByTestId('device-phone').click();
      const frame = page.getByTestId('preview-frame');
      const box = (await frame.boundingBox())!;
      expect(Math.round(box.width)).toBe(390);
      expect(await frame.evaluate((f) => f.scrollWidth <= f.clientWidth)).toBe(true);
      // container query: summary/flip grid switch to the narrow layout
      expect(await view.locator('.flip-grid').evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length)).toBe(2);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `docs/screenshots/${info.project.name}/p2-preview-phone-frame.png` });
    }

    await page.getByTestId('back-to-editor').click();
    await expect(page.getByTestId('page-editor')).toBeVisible();
  });

  test('local image, audio and video survive a full restart with no network', async ({}, testInfo) => {
    const dir = newProfileDir();
    const base = String(testInfo.project.use.baseURL);

    const ctx1 = await launchProfile(dir, testInfo);
    const p1 = ctx1.pages()[0] ?? (await ctx1.newPage());
    await primeOffline(p1);
    await disableSplash(p1);
    await ctx1.setOffline(true); // everything below happens with the network cut
    await newLessonInEditor(p1, 'درس بالوسائط');
    await p1.getByTestId('tab-content').click();
    await addBlock(p1, 'image');
    await p1.getByTestId('image-input').setInputFiles(FX('energy-diagram.png'));
    await expect(p1.getByTestId('image-preview')).toBeVisible();
    await p1.getByTestId('image-alt').fill('رسم الطاقة');
    await addBlock(p1, 'audio');
    await p1.getByTestId('audio-input').setInputFiles(FX('tone.wav'));
    await expect(p1.getByTestId('audio-preview')).toBeVisible();
    await addBlock(p1, 'video');
    await p1.getByTestId('video-input').setInputFiles(FX('clip.webm'));
    await expect(p1.getByTestId('video-preview')).toBeVisible();
    await waitSaved(p1);
    const editorUrl = p1.url();
    await ctx1.close();

    const ctx2 = await launchProfile(dir, testInfo);
    await ctx2.setOffline(true);
    const page = ctx2.pages()[0] ?? (await ctx2.newPage());
    const net = watchNetwork(page, base);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(editorUrl);
    await expect(page.getByTestId('page-editor')).toBeVisible();
    expect(await blockTypes(page)).toEqual(['image', 'audio', 'video']);
    const img = page.getByTestId('image-preview');
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(1600);
    await expect(page.getByTestId('image-alt')).toHaveValue('رسم الطاقة');
    const duration = (sel: string) => page.getByTestId(sel).evaluate((m: HTMLMediaElement) => (m.readyState >= 1 ? m.duration : 0));
    await expect.poll(() => duration('audio-preview'), { timeout: 10_000 }).toBeGreaterThan(1);
    await expect.poll(() => duration('video-preview'), { timeout: 10_000 }).toBeGreaterThan(0);

    await page.getByTestId('open-preview').click();
    await expect.poll(() => page.getByTestId('lv-image').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1600);
    await expect.poll(() => page.getByTestId('lv-audio').evaluate((m: HTMLMediaElement) => m.readyState), { timeout: 10_000 }).toBeGreaterThan(0);
    await expect.poll(() => page.getByTestId('lv-video').evaluate((m: HTMLMediaElement) => m.readyState), { timeout: 10_000 }).toBeGreaterThan(0);

    expect(net.external).toEqual([]);
    expect(net.failed).toEqual([]);
    expect(errors).toEqual([]);
    await ctx2.close();
  });

  test('two windows editing the same lesson: the second save is stopped instead of overwriting', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'desktop-1440', 'one device size is enough for this logic');
    await newLessonInEditor(page);
    const url = page.url();
    const other = await context.newPage();
    await other.goto(url);
    await expect(other.getByTestId('page-editor')).toBeVisible();

    await page.getByTestId('lesson-summary-field').fill('من النافذة الأولى');
    await waitSaved(page);
    await other.getByTestId('lesson-summary-field').fill('من النافذة الثانية');
    await expect(other.getByTestId('conflict-banner')).toBeVisible({ timeout: 10_000 });
    await expect(other.getByTestId('save-status')).toHaveAttribute('data-state', 'conflict');

    await other.getByRole('button', { name: 'تحميل النسخة المحفوظة' }).click();
    await expect(other.getByTestId('lesson-summary-field')).toHaveValue('من النافذة الأولى');
    await expect(other.getByTestId('conflict-banner')).toBeHidden();
    await other.close();
  });

  test('deleting a lesson from its project also removes its content and media; undo restores them', async ({ page }) => {
    await newLessonInEditor(page, 'درس سيُحذف');
    await page.getByTestId('tab-content').click();
    await addBlock(page, 'image');
    await page.getByTestId('image-input').setInputFiles(FX('energy-diagram.png'));
    await expect(page.getByTestId('image-preview')).toBeVisible();
    await waitSaved(page);
    const counts = () =>
      page.evaluate(
        () =>
          new Promise<number[]>((resolve) => {
            const r = indexedDB.open('ibrahi8m-edu');
            r.onsuccess = () => {
              const db = r.result;
              const tx = db.transaction(['lessonDocs', 'assets'], 'readonly');
              const a = tx.objectStore('lessonDocs').count();
              const b = tx.objectStore('assets').count();
              tx.oncomplete = () => {
                resolve([a.result, b.result]);
                db.close();
              };
            };
          }),
      );
    expect(await counts()).toEqual([1, 1]);
    await page.getByRole('link', { name: 'وحدة الطاقة' }).click();
    await page.getByRole('button', { name: 'تعديل بيانات الدرس: درس سيُحذف' }).click();
    await page.getByTestId('lesson-delete').click();
    await page.getByTestId('confirm-delete-lesson').getByRole('button', { name: 'حذف الدرس' }).click();
    await expect(page.getByTestId('lessons-empty')).toBeVisible();
    expect(await counts()).toEqual([0, 0]);
    await page.getByTestId('toast').getByRole('button', { name: 'تراجع' }).click();
    await expect(page.getByTestId('lesson-row')).toHaveCount(1);
    expect(await counts()).toEqual([1, 1]);
    await page.getByRole('button', { name: 'فتح محرر الدرس: درس سيُحذف' }).click();
    await page.getByTestId('tab-content').click();
    await expect.poll(() => page.getByTestId('image-preview').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1600);
  });

  test('the lesson builder lists lessons and starts a new lesson inside a chosen project', async ({ page }) => {
    await newLessonInEditor(page, 'درس موجود');
    await page.goto('./#/builder');
    await expect(page.getByTestId('builder-lessons').getByTestId('lesson-row')).toHaveCount(1);
    await expect(page.getByTestId('builder-lessons')).toContainText('لم يُبنَ بعد');
    await page.getByTestId('builder-new-lesson').click();
    await page.getByTestId('builder-create').click();
    await expect(page.getByTestId('builder-dialog').getByRole('alert')).toHaveText('عنوان الدرس مطلوب.');
    await page.getByTestId('builder-title').fill('درس من منشئ الدروس');
    await page.getByTestId('builder-create').click();
    await expect(page.getByTestId('page-editor')).toBeVisible();
    await expect(page.getByTestId('lesson-title-field')).toHaveValue('درس من منشئ الدروس');
    await expect(page.locator('.crumbs')).toContainText('وحدة الطاقة');
  });
});
