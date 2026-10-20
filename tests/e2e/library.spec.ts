import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { settleAfterAdd } from './helpers';
import { disableSplash, lessonWithObjectives, waitSaved } from './quiz-helpers';

const FX = (f: string) => fileURLToPath(new URL(`../fixtures/${f}`, import.meta.url));

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);

async function fits(page: Page, label: string) {
  const vw = page.viewportSize()!.width;
  const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollW, `horizontal overflow: ${label}`).toBeLessThanOrEqual(vw);
  expect(innerW, `zoomed out: ${label}`).toBe(vw);
}

const item = (page: Page, title: string) => page.locator(`[data-testid="library-item"][data-title="${title}"]`);

/** Opens the "use" dialog of a library item, fills it and follows the toast's «فتح» link. */
async function useItem(page: Page, title: string, o: { project: string; lesson?: string; newTitle?: string }) {
  await page.goto('./#/library');
  await item(page, title).getByTestId('library-use').click();
  const d = page.getByTestId('library-use-dialog');
  await d.getByTestId('library-use-project').selectOption({ label: o.project });
  if (o.lesson) await d.getByTestId('library-use-lesson').selectOption({ label: o.lesson });
  if (o.newTitle) await d.getByTestId('library-use-title').fill(o.newTitle);
  await d.getByTestId('library-use-save').click();
  await expect(d).toBeHidden();
  const t = page.getByTestId('toast').filter({ hasText: 'أُ' }).last();
  await t.getByRole('button', { name: 'فتح' }).click();
}

test.describe('المكتبة المحلية', () => {
  test.beforeEach(async ({ page }) => {
    await disableSplash(page);
  });

  test('قالب درس جاهز ← درس جديد كامل، ثم حفظ الدرس قالبًا وإعادة استخدامه', async ({ page }) => {
    await lessonWithObjectives(page);
    await page.goto('./#/library');
    await expect(page.getByTestId('page-library')).toBeVisible();
    expect(await page.getByTestId('library-item').count()).toBeGreaterThanOrEqual(7);
    expect(await serious(page)).toEqual([]);
    await fits(page, 'library');

    // preview of a built-in lesson template
    await item(page, 'درس بالتعلم بالاكتشاف').getByTestId('library-preview').click();
    const pv = page.getByTestId('library-preview-dialog');
    await expect(pv).toBeVisible();
    await expect(pv).toContainText('نشاط الاكتشاف');
    expect(await serious(page)).toEqual([]);
    await fits(page, 'preview');
    await page.keyboard.press('Escape');
    await expect(pv).toBeHidden();

    await useItem(page, 'درس بالتعلم بالاكتشاف', { project: 'وحدة الطاقة', newTitle: 'اكتشاف مصادر الطاقة' });
    await expect(page.getByTestId('page-editor')).toBeVisible();
    await expect(page.getByTestId('lesson-title-field')).toHaveValue('اكتشاف مصادر الطاقة');
    await page.getByTestId('tab-content').click();
    await expect(page.getByTestId('block')).toHaveCount(7);
    await expect(page.getByTestId('activity-title').first()).toHaveValue('نشاط الاكتشاف');

    // edit, then save this lesson as the teacher's own template
    await page.getByTestId('activity-title').first().fill('نشاط اكتشاف الطاقة');
    await waitSaved(page);
    await page.getByTestId('lesson-to-library').click();
    const sd = page.getByTestId('library-save-dialog');
    await sd.getByTestId('library-title').fill('قالبي: اكتشاف الطاقة');
    await sd.getByTestId('library-tags').fill('علوم، الصف السابع');
    await sd.getByTestId('library-save').click();
    await expect(sd).toBeHidden();

    await page.goto('./#/library?source=mine');
    await expect(page.getByTestId('library-item')).toHaveCount(1);
    await expect(item(page, 'قالبي: اكتشاف الطاقة')).toHaveAttribute('data-kind', 'lesson');

    // reuse it: the new lesson carries the edited content
    await useItem(page, 'قالبي: اكتشاف الطاقة', { project: 'وحدة الطاقة', newTitle: 'درس ثانٍ من قالبي' });
    await page.getByTestId('tab-content').click();
    await expect(page.getByTestId('activity-title').first()).toHaveValue('نشاط اكتشاف الطاقة');

    // the project now holds three lessons
    await page.goto('./#/projects');
    await page.getByRole('link', { name: /وحدة الطاقة/ }).first().click();
    await expect(page.getByText('درس ثانٍ من قالبي').first()).toBeVisible();
    await expect(page.getByText('اكتشاف مصادر الطاقة').first()).toBeVisible();
  });

  test('حفظ عنصر من درس وإدراجه في درس آخر، ووسيط مرفوع إلى المكتبة يُدرج في درس', async ({ page }) => {
    await lessonWithObjectives(page);
    await page.getByTestId('tab-content').click();
    await page.getByTestId('add-block').last().click();
    await page.getByTestId('add-activity').click();
    await settleAfterAdd(page);
    await page.getByTestId('activity-title').last().fill('صنّف مصادر الطاقة');
    await page.getByTestId('activity-steps').last().fill('اقرأ البطاقات\nصنّفها في جدول');
    await waitSaved(page);
    await page.getByTestId('block').last().getByTestId('block-to-library').click();
    const sd = page.getByTestId('library-save-dialog');
    await expect(sd.getByTestId('library-title')).not.toHaveValue('');
    await sd.getByTestId('library-title').fill('نشاط التصنيف');
    await sd.getByTestId('library-tags').fill('نشاط، تصنيف');
    await sd.getByTestId('library-save').click();
    await expect(sd).toBeHidden();

    // a second lesson in the same project
    await page.goto('./#/projects');
    await page.getByRole('link', { name: /وحدة الطاقة/ }).first().click();
    await page.getByTestId('new-lesson').first().click();
    await page.getByTestId('lesson-title').fill('تحولات الطاقة');
    await page.getByTestId('lesson-save').click();
    await expect(page.getByTestId('lesson-dialog')).toBeHidden();

    await useItem(page, 'نشاط التصنيف', { project: 'وحدة الطاقة', lesson: 'تحولات الطاقة' });
    await expect(page.getByTestId('page-editor')).toBeVisible();
    await expect(page.getByTestId('block')).toHaveCount(1);
    await expect(page.getByTestId('activity-title')).toHaveValue('صنّف مصادر الطاقة');
    await expect(page.getByTestId('activity-steps')).toHaveValue('اقرأ البطاقات\nصنّفها في جدول');

    // a built-in block, too
    await useItem(page, 'بطاقة خروج', { project: 'وحدة الطاقة', lesson: 'تحولات الطاقة' });
    await expect(page.getByTestId('block')).toHaveCount(2);
    await expect(page.getByTestId('activity-title').last()).toHaveValue('بطاقة الخروج');

    // upload an image straight into the library, then into the lesson
    await page.goto('./#/library');
    await page.getByTestId('library-upload').setInputFiles(FX('energy-diagram.png'));
    await expect(item(page, 'energy-diagram')).toHaveAttribute('data-source', 'mine');
    await expect(page.getByTestId('library-usage')).toBeVisible();
    await item(page, 'energy-diagram').getByTestId('library-preview').click();
    await expect.poll(() => page.getByTestId('library-preview-dialog').locator('img').evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await useItem(page, 'energy-diagram', { project: 'وحدة الطاقة', lesson: 'تحولات الطاقة' });
    await expect(page.getByTestId('block')).toHaveCount(3);
    await expect(page.getByTestId('block').last()).toHaveAttribute('data-type', 'image');
    await expect(page.getByTestId('image-preview').last()).toBeVisible();
    await expect.poll(() => page.getByTestId('image-preview').last().evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    // the lesson's copy is independent: deleting the library file keeps the lesson image
    await page.goto('./#/library');
    await page.locator('[data-testid="library-item"][data-source="mine"][data-title="energy-diagram"]').getByTestId('library-delete').click();
    await expect(page.locator('[data-testid="library-item"][data-source="mine"][data-title="energy-diagram"]')).toHaveCount(0);
    // lesson media appear under "من الدروس"
    await page.getByTestId('library-source').selectOption('lesson');
    await expect(page.locator('[data-testid="library-item"][data-source="lesson"]').first()).toBeVisible();
  });

  test('البحث والتصفية والوسوم والحذف مع التراجع', async ({ page }) => {
    await lessonWithObjectives(page);
    await page.getByTestId('lesson-to-library').click();
    const sd = page.getByTestId('library-save-dialog');
    await sd.getByTestId('library-title').fill('درس الطاقة الأصلي');
    await sd.getByTestId('library-description').fill('أهداف التذكر والتحليل');
    await sd.getByTestId('library-tags').fill('علوم، طاقة');
    await sd.getByTestId('library-save').click();
    await expect(sd).toBeHidden();

    await page.goto('./#/library');
    await expect(item(page, 'درس الطاقة الأصلي')).toBeVisible();
    const all = await page.getByTestId('library-item').count();
    expect(all).toBe(8); // 7 built-in + the saved lesson

    // search matches title, description and tags
    await page.getByTestId('library-search').fill('التحليل');
    await expect(page.getByTestId('library-item')).toHaveCount(1);
    await expect(item(page, 'درس الطاقة الأصلي')).toBeVisible();
    await page.getByTestId('library-search').fill('جيكسو');
    await expect(item(page, 'درس بالتعلم التعاوني (جيكسو)')).toBeVisible();
    await page.getByTestId('library-search').fill('لا يوجد شيء بهذا الاسم');
    await expect(page.getByTestId('library-none')).toBeVisible();
    await page.getByTestId('library-search').fill('');
    await expect(page.getByTestId('library-item')).toHaveCount(all);

    // kind filter
    await page.getByTestId('library-kind').selectOption('block');
    for (const k of await page.getByTestId('library-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))) expect(k).toBe('block');
    await page.getByTestId('library-kind').selectOption('design');
    await expect(item(page, 'نموذج فراير للمفهوم')).toBeVisible();
    await page.getByTestId('library-kind').selectOption('');

    // source filter + tags
    await page.getByTestId('library-source').selectOption('builtin');
    for (const s of await page.getByTestId('library-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-source')))) expect(s).toBe('builtin');
    // built-ins cannot be edited or deleted
    await expect(page.getByTestId('library-delete')).toHaveCount(0);
    await expect(page.getByTestId('library-edit')).toHaveCount(0);
    await page.getByTestId('library-source').selectOption('');
    await page.getByRole('button', { name: 'طاقة', exact: true }).click();
    await expect(page.getByTestId('library-item')).toHaveCount(1);
    // filters live in the address: they survive a reload
    await page.reload();
    await expect(page.getByTestId('library-item')).toHaveCount(1);
    await page.getByRole('button', { name: 'طاقة', exact: true }).click();
    await expect(page.getByTestId('library-item')).toHaveCount(all);

    // edit title and tags
    await item(page, 'درس الطاقة الأصلي').getByTestId('library-edit').click();
    const ed = page.getByRole('dialog', { name: 'تعديل عنصر المكتبة' });
    await ed.getByTestId('library-title').fill('درس الطاقة (معدّل)');
    await ed.getByTestId('library-save').click();
    await expect(ed).toBeHidden();
    await expect(item(page, 'درس الطاقة (معدّل)')).toBeVisible();

    // delete, then undo
    await item(page, 'درس الطاقة (معدّل)').getByTestId('library-delete').click();
    await expect(item(page, 'درس الطاقة (معدّل)')).toHaveCount(0);
    await page.getByTestId('toast').getByRole('button', { name: 'تراجع' }).click();
    await expect(item(page, 'درس الطاقة (معدّل)')).toBeVisible();
    await page.reload();
    await expect(item(page, 'درس الطاقة (معدّل)')).toBeVisible();
    expect(await serious(page)).toEqual([]);
    await fits(page, 'library filtered');
  });
});
