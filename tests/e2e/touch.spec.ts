import { expect, test, type Locator, type Page } from '@playwright/test';
import { settleAfterAdd, waitPastSplash } from './helpers';

/**
 * Phase 2 on phones, driven by real touch events (tap), not mouse clicks.
 * Runs only on the phone device profiles (hasTouch: true).
 */
const tap = (l: Locator) => l.tap();

async function waitSaved(page: Page) {
  await page.waitForTimeout(120);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
}

/** Smallest visible tap target (width × height) among the given elements. */
async function smallestTarget(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((els) =>
    els
      .map((e) => {
        const r = e.getBoundingClientRect();
        const s = getComputedStyle(e);
        return { w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden', label: e.getAttribute('aria-label') || e.textContent?.trim().slice(0, 30) || e.className };
      })
      .filter((x) => x.visible)
      .sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h))[0],
  );
}

test.describe('Phase 2 — touch use on phones', () => {
  test.beforeEach(async ({}, info) => {
    test.skip(!info.project.name.startsWith('phone'), 'touch flow runs on phone profiles only');
  });

  test('a whole lesson can be built with taps: objective, blocks, reorder, alignment, preview', async ({ page }) => {
    await page.goto('./#/settings');
    await waitPastSplash(page);
    await tap(page.getByTestId('toggle-splash'));

    await page.goto('./#/projects');
    await tap(page.getByTestId('new-project'));
    await page.getByTestId('project-title').fill('وحدة اللمس');
    await tap(page.getByTestId('project-save'));
    await expect(page.getByTestId('project-heading')).toHaveText('وحدة اللمس');
    await tap(page.getByTestId('new-lesson').first());
    await page.getByTestId('lesson-title').fill('درس على الجوال');
    await tap(page.getByTestId('lesson-save'));
    await expect(page.getByTestId('lesson-dialog')).toBeHidden();
    await tap(page.getByRole('button', { name: 'فتح محرر الدرس: درس على الجوال' }));
    await expect(page.getByTestId('page-editor')).toBeVisible();

    // Objective from the Bloom bank by touch
    await tap(page.getByTestId('add-objective'));
    const obj = page.getByTestId('objective').last();
    await tap(obj.getByRole('radio', { name: '2 الفهم' }));
    await tap(obj.getByTestId('verb-bank').getByRole('button', { name: 'يشرح', exact: true }));
    await obj.getByTestId('objective-content').fill('سبب تعاقب الليل والنهار');
    await expect(obj.getByTestId('objective-statement')).toHaveText('أن يشرح الطالب سبب تعاقب الليل والنهار.');

    // Blocks by touch
    const addBlock = async (type: string) => {
      await tap(page.getByTestId('add-block').last());
      await tap(page.getByTestId(`add-${type}`));
      await expect(page.getByTestId('add-block-dialog')).toBeHidden();
      await settleAfterAdd(page);
    };
    await tap(page.getByTestId('tab-content'));
    await addBlock('text');
    await page.getByTestId('text-body').fill('تدور الأرض حول نفسها.');
    await addBlock('cards');
    await page.getByTestId('card-front').first().fill('الليل');
    await page.getByTestId('card-back').first().fill('الجهة البعيدة عن الشمس');
    await addBlock('activity');
    await page.getByTestId('activity-title').fill('نموذج بالمصباح');

    // Reorder by touch: activity to the top
    const types = () => page.getByTestId('block').evaluateAll((els) => els.map((e) => e.getAttribute('data-type')));
    await tap(page.getByTestId('block').nth(2).getByTestId('block-up'));
    await tap(page.getByTestId('block').nth(1).getByTestId('block-up'));
    await expect.poll(types).toEqual(['activity', 'text', 'cards']);

    // Tap targets in the editor stay finger-sized
    const smallest = await smallestTarget(page, '.page button, .page [role=tab], .page select, .page input:not([type=checkbox]):not([type=file])');
    expect(Math.min(smallest.w, smallest.h), `smallest target: ${JSON.stringify(smallest)}`).toBeGreaterThanOrEqual(40);
    const icon = await smallestTarget(page, '.page .icon-btn');
    expect(Math.min(icon.w, icon.h), `smallest icon button: ${JSON.stringify(icon)}`).toBeGreaterThanOrEqual(44);

    // Alignment by touch (mobile shows chips per objective)
    await tap(page.getByTestId('tab-alignment'));
    await expect(page.getByTestId('alignment-list')).toBeVisible();
    const row = page.getByTestId('coverage-row').first();
    await expect(row).toHaveAttribute('data-status', 'uncovered');
    await tap(row.getByTestId('matrix-cell').filter({ hasText: 'نموذج بالمصباح' }));
    await tap(row.getByTestId('matrix-cell').filter({ hasText: 'تدور الأرض' }));
    await expect(row).toHaveAttribute('data-status', 'covered');
    await waitSaved(page);

    // Survives a reload
    await page.reload();
    await tap(page.getByTestId('tab-content'));
    await expect.poll(types).toEqual(['activity', 'text', 'cards']);

    // Preview: flip a card and tick an activity step by touch
    await tap(page.getByTestId('open-preview'));
    await expect(page.getByTestId('lesson-view')).toBeVisible();
    const card = page.getByTestId('flip-card').first();
    await expect(card).toHaveAttribute('aria-pressed', 'false');
    await tap(card);
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toHaveAccessibleName(/الجهة البعيدة عن الشمس/);
    const vw = page.viewportSize()!.width;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw);
    await tap(page.getByTestId('back-to-editor'));
    await expect(page.getByTestId('page-editor')).toBeVisible();
  });
});
