import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { signedIn } from './signin';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const launch = (userData: string) => electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, IBRAHI8M_USER_DATA: userData } });
const go = (w: Page, hash: string) => w.goto(`app://edu/index.html#${hash}`);

test('desktop app: build a quiz, take it, close the app; the attempt and results are there after reopening', async () => {
  test.setTimeout(120_000);
  const userData = mkdtempSync(join(tmpdir(), 'ibrahi8m-desktop-quiz-'));

  const app1 = await launch(userData);
  const w1 = await app1.firstWindow();
  await signedIn(w1);
  await expect(w1.getByTestId('page-dashboard')).toBeVisible({ timeout: 10_000 });
  await go(w1, '/settings');
  await w1.getByTestId('toggle-splash').uncheck();

  await go(w1, '/projects');
  await w1.getByTestId('new-project').click();
  await w1.getByTestId('project-title').fill('مشروع سطح المكتب');
  await w1.getByTestId('project-save').click();
  await expect(w1.getByTestId('project-heading')).toHaveText('مشروع سطح المكتب');

  await go(w1, '/quizzes');
  await w1.getByTestId('new-quiz').click();
  await w1.getByTestId('quiz-title-input').fill('اختبار سطح المكتب');
  await w1.getByTestId('quiz-project-select').selectOption({ label: 'مشروع سطح المكتب' });
  await w1.getByTestId('create-quiz-save').click();
  await expect(w1.getByTestId('page-quiz-editor')).toBeVisible();
  for (const [prompt, answer] of [
    ['الشمس نجم.', 'tf-true'],
    ['القمر مصدر للضوء.', 'tf-false'],
  ]) {
    await w1.getByTestId('add-question').last().click();
    await w1.getByTestId('add-q-truefalse').click();
    const c = w1.getByTestId('question').last();
    await c.getByTestId('q-prompt').fill(prompt);
    await c.getByTestId('q-feedback-incorrect').fill('راجع الدرس.');
    await c.getByTestId(answer).click();
  }
  await w1.waitForTimeout(150);
  await expect(w1.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });

  await go(w1, '/learn');
  await w1.getByTestId('learn-name').fill('أمل');
  await w1.getByTestId('learn-continue').click();
  await w1.locator('[data-testid="student-quiz"][data-quiz="اختبار سطح المكتب"]').getByTestId('student-quiz-go').click();
  await expect(w1.getByTestId('take-who')).toContainText('أمل');
  await w1.getByTestId('take-start').click();
  await w1.getByTestId('take-true').check();
  await w1.getByTestId('take-next').click();
  await w1.getByTestId('take-true').check(); // wrong
  await w1.getByTestId('take-to-review').click();
  await w1.getByTestId('take-submit').click();
  await expect(w1.getByTestId('result-score')).toHaveText('1 / 2');
  await expect(w1.getByTestId('result-percent')).toHaveText('50٪');
  await w1.screenshot({ path: 'docs/screenshots/desktop-app/quiz-result.png' });
  await app1.close();

  const app2 = await launch(userData);
  const w2 = await app2.firstWindow();
  await signedIn(w2);
  await go(w2, '/results');
  await w2.getByTestId('results-row').first().click();
  await expect(w2.getByTestId('sum-attempts')).toHaveText('1');
  await expect(w2.getByTestId('attempt-row').first()).toContainText('أمل');
  await expect(w2.getByTestId('attempt-row').first()).toContainText('1/2');
  await w2.screenshot({ path: 'docs/screenshots/desktop-app/quiz-results.png' });
  // student mode after the restart: same student, the finished attempt and its result
  await go(w2, '/learn');
  await expect(w2.getByTestId('student-chip')).toHaveText('أمل');
  await expect(w2.locator('[data-testid="student-quiz"][data-quiz="اختبار سطح المكتب"]').getByTestId('student-quiz-status')).toHaveText('محاولة واحدة · نتيجتك: 50٪');
  await w2.screenshot({ path: 'docs/screenshots/desktop-app/student-home.png' });
  // the network stays blocked in the desktop app
  expect(
    await w2.evaluate(async () => {
      try {
        await fetch('https://example.com/');
        return 'reached';
      } catch {
        return 'blocked';
      }
    }),
  ).toBe('blocked');
  await app2.close();
});
