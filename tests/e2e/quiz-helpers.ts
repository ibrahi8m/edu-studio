import { expect, type Locator, type Page } from '@playwright/test';
import { waitPastSplash } from './helpers';

export const isPhone = (name: string) => name.startsWith('phone');

export async function disableSplash(page: Page) {
  await page.goto('./#/settings');
  await waitPastSplash(page);
  await page.getByTestId('toggle-splash').uncheck();
}

export async function waitSaved(page: Page) {
  await page.waitForTimeout(120);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
}

/** Project + lesson with two objectives written in the lesson editor (via the Bloom bank). */
export async function lessonWithObjectives(page: Page, project = 'وحدة الطاقة', lesson = 'مصادر الطاقة') {
  await page.goto('./#/projects');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-title').fill(project);
  await page.getByTestId('project-subject').fill('العلوم');
  await page.getByTestId('project-save').click();
  await expect(page.getByTestId('project-heading')).toHaveText(project);
  await page.getByTestId('new-lesson').first().click();
  await page.getByTestId('lesson-title').fill(lesson);
  await page.getByTestId('lesson-save').click();
  await expect(page.getByTestId('lesson-dialog')).toBeHidden();
  await page.getByRole('button', { name: `فتح محرر الدرس: ${lesson}` }).click();
  await expect(page.getByTestId('page-editor')).toBeVisible();
  for (const [level, verb, content] of [
    ['1 التذكر', 'يعدّد', 'مصادر الطاقة المتجددة'],
    ['4 التحليل', 'يقارن', 'بين الطاقة المتجددة وغير المتجددة'],
  ]) {
    await page.getByTestId('add-objective').click();
    const card = page.getByTestId('objective').last();
    await card.getByRole('radio', { name: level }).click();
    await card.getByTestId('verb-bank').getByRole('button', { name: verb, exact: true }).click();
    await card.getByTestId('objective-content').fill(content);
  }
  await waitSaved(page);
}

/** Creates a quiz from the quizzes page and opens its editor. */
export async function newQuiz(page: Page, title: string, project = 'وحدة الطاقة', lesson: string | null = 'مصادر الطاقة') {
  await page.goto('./#/quizzes');
  await page.getByTestId('new-quiz').click();
  const d = page.getByTestId('create-quiz-dialog');
  await d.getByTestId('quiz-title-input').fill(title);
  await d.getByTestId('quiz-project-select').selectOption({ label: project });
  if (lesson) await d.getByTestId('quiz-lesson-select').selectOption({ label: lesson });
  await d.getByTestId('create-quiz-save').click();
  await expect(page.getByTestId('page-quiz-editor')).toBeVisible();
  await expect(page.getByTestId('quiz-title-field')).toHaveValue(title);
}

export async function addQuestion(page: Page, type: string): Promise<Locator> {
  await page.getByTestId('add-question').last().click();
  await page.getByTestId(`add-q-${type}`).click();
  await expect(page.getByTestId('add-question-dialog')).toBeHidden();
  await page.waitForTimeout(350); // smooth scroll to the new card
  return page.getByTestId('question').last();
}

export async function common(card: Locator, o: { prompt?: string; points?: string; feedbackOk?: string; feedbackBad?: string; objectives?: number[] }) {
  if (o.prompt !== undefined) await card.getByTestId('q-prompt').fill(o.prompt);
  if (o.points) await card.getByTestId('q-points').fill(o.points);
  if (o.feedbackOk) await card.getByTestId('q-feedback-correct').fill(o.feedbackOk);
  if (o.feedbackBad) await card.getByTestId('q-feedback-incorrect').fill(o.feedbackBad);
  if (o.objectives?.length) {
    const page = card.page();
    await card.getByTestId('q-link').click();
    const dlg = page.getByTestId('q-link-dialog');
    for (const i of o.objectives) await dlg.getByTestId('q-link-checkbox').nth(i).check();
    await dlg.getByTestId('q-link-done').click();
    await expect(dlg).toBeHidden();
  }
}

export async function mcq(card: Locator, options: string[], correct: number[], multiple = false) {
  if (multiple) await card.getByTestId('mcq-multiple').check();
  // New questions start with four empty options; remove the ones not needed (empty options block the quiz).
  while ((await card.getByTestId('mcq-option').count()) > options.length) {
    const n = await card.getByTestId('mcq-option').count();
    await card.getByRole('button', { name: `حذف الخيار ${n}` }).click();
  }
  for (let i = 0; i < options.length; i++) await card.getByTestId('mcq-option-text').nth(i).fill(options[i]);
  for (const i of correct) await card.getByTestId('mcq-correct').nth(i).check();
}

export async function pairs(card: Locator, list: [string, string][]) {
  for (let i = 0; i < list.length; i++) {
    await card.getByTestId('pair-left').nth(i).fill(list[i][0]);
    await card.getByTestId('pair-right').nth(i).fill(list[i][1]);
  }
}

export async function orderItems(card: Locator, items: string[]) {
  for (let i = 0; i < items.length; i++) await card.getByTestId('order-text').nth(i).fill(items[i]);
}

/* ───────── student side ───────── */

/** Student mode (#/learn): picks the student by name (switching if someone else is chosen). */
export async function chooseStudent(page: Page, name: string, url = './#/learn') {
  await page.goto(url);
  const who = page.getByTestId('page-learn-who');
  const home = page.getByTestId('page-learn');
  await expect(who.or(home)).toBeVisible();
  if (await home.isVisible()) {
    if ((await page.getByTestId('student-chip').textContent())?.trim() === name) return;
    await page.getByTestId('switch-student').click();
  }
  await page.getByTestId('learn-name').fill(name);
  await page.getByTestId('learn-continue').click();
  await expect(page.getByTestId('page-learn')).toBeVisible();
  await expect(page.getByTestId('student-chip')).toHaveText(name);
}

export const quizRow = (page: Page, title: string) => page.locator(`[data-testid="student-quiz"][data-quiz="${title}"]`).first();

/** Opens a quiz's start screen from student mode as `name`. */
export async function openQuizAs(page: Page, quizTitle: string, name: string, url?: string) {
  await chooseStudent(page, name, url);
  await quizRow(page, quizTitle).getByTestId('student-quiz-go').click();
  await expect(page.getByTestId('take-intro')).toBeVisible();
  await expect(page.getByTestId('take-who')).toContainText(name);
}

export async function startAs(page: Page, quizTitle: string, name: string) {
  await openQuizAs(page, quizTitle, name);
  await page.getByTestId('take-start').click();
  await expect(page.getByTestId('take-question')).toBeVisible();
}

export const current = (page: Page) => page.getByTestId('take-question');

/** Moves ordering items with the up buttons until they are in `target` order. */
export async function arrange(page: Page, target: string[]) {
  for (let pos = 0; pos < target.length; pos++) {
    for (let guard = 0; guard < 10; guard++) {
      const texts = await current(page).getByTestId('take-order-text').allTextContents();
      const at = texts.indexOf(target[pos]);
      if (at === pos) break;
      await current(page).getByRole('button', { name: `نقل «${target[pos]}» للأعلى` }).click();
    }
  }
  await expect(current(page).getByTestId('take-order-text')).toHaveText(target);
}

export async function next(page: Page) {
  await page.getByTestId('take-next').click();
}
