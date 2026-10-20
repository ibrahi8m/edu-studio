import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchProfile, newProfileDir, primeOffline, watchNetwork } from './helpers';
import {
  chooseStudent,
  addQuestion,
  arrange,
  common,
  current,
  disableSplash,
  isPhone,
  lessonWithObjectives,
  mcq,
  newQuiz,
  next,
  openQuizAs,
  orderItems,
  quizRow,
  pairs,
  startAs,
  waitSaved,
} from './quiz-helpers';

/**
 * The full quiz used by the first test: one question of every type (MCQ twice: single and multiple answer).
 * Points: 2 + 2 + 1 + 1 + 3 + 3 + 2 = 14.
 */
async function buildFullQuiz(page: Page) {
  let c = await addQuestion(page, 'mcq');
  await common(c, { prompt: 'أي مما يلي مصدر متجدد للطاقة؟', points: '2', feedbackOk: 'أحسنت، الشمس لا تنفد.', feedbackBad: 'المصادر المتجددة لا تنفد مثل الشمس.', objectives: [0] });
  await mcq(c, ['الفحم', 'الشمس', 'النفط', 'الغاز الطبيعي'], [1]);

  c = await addQuestion(page, 'mcq');
  await common(c, { prompt: 'اختر كل المصادر المتجددة.', points: '2', feedbackBad: 'الشمس والرياح متجددتان.', objectives: [0] });
  await mcq(c, ['الشمس', 'الفحم', 'الرياح', 'النفط'], [0, 2], true);

  c = await addQuestion(page, 'truefalse');
  await common(c, { prompt: 'الفحم مصدر متجدد للطاقة.', points: '1', feedbackBad: 'الفحم يتكوّن في ملايين السنين فهو غير متجدد.', objectives: [1] });
  await c.getByTestId('tf-false').click();

  c = await addQuestion(page, 'short');
  await common(c, { prompt: 'ما النجم الذي نحصل منه على الطاقة الشمسية؟', points: '1', feedbackOk: 'صحيح.', feedbackBad: 'إنها الشمس.', objectives: [0] });
  await c.getByTestId('short-accepted').first().fill('الشمس');
  // the teacher can see how answers will be graded before publishing
  const tester = c.getByTestId('match-tester');
  await tester.fill('شمس');
  await expect(c.getByTestId('match-tester-result')).toContainText('تُقبل');
  await tester.fill('هي الشمس طبعا');
  await expect(c.getByTestId('match-tester-result')).toContainText('مراجعة المعلم');
  await tester.fill('القمر');
  await expect(c.getByTestId('match-tester-result')).toContainText('خاطئة');
  await tester.fill('');

  c = await addQuestion(page, 'matching');
  await common(c, { prompt: 'طابق كل مصدر بطريقة الاستفادة منه.', points: '3', feedbackBad: 'الألواح للشمس، والتوربينات للرياح، والسدود للماء.', objectives: [1] });
  await pairs(c, [
    ['الشمس', 'ألواح شمسية'],
    ['الرياح', 'توربينات'],
    ['الماء', 'سدود'],
  ]);

  c = await addQuestion(page, 'ordering');
  await common(c, { prompt: 'رتّب مراحل توليد الكهرباء من الرياح.', points: '3', feedbackBad: 'تدور الشفرات أولًا ثم يعمل المولد ثم تنتقل الكهرباء.', objectives: [1] });
  await orderItems(c, ['تدور الشفرات', 'يعمل المولد', 'تنتقل الكهرباء']);

  c = await addQuestion(page, 'fill');
  await common(c, { points: '2', feedbackOk: 'ممتاز.', feedbackBad: 'الشمس والرياح مصدران متجددان.', objectives: [0] });
  await c.getByTestId('fill-text').fill('من مصادر الطاقة المتجددة [[الشمس]] و[[الرياح|الهواء]].');
}

test.describe('Phase 3 — quiz builder, student mode and grading', () => {
  test.beforeEach(async ({ page }) => {
    await disableSplash(page);
  });

  test('every question type is built, saved, reopened, taken and graded exactly', async ({ page }, info) => {
    test.setTimeout(240_000);
    await lessonWithObjectives(page);
    await newQuiz(page, 'اختبار الطاقة المتجددة');

    // An empty quiz is not ready, and the student button is disabled
    await expect(page.getByTestId('try-quiz')).toBeDisabled();
    await buildFullQuiz(page);

    // Incomplete question → not ready; completing it makes the quiz ready
    await expect(page.getByTestId('readiness-alert')).toHaveCount(0);
    await expect(page.getByTestId('question')).toHaveCount(7);
    await expect(page.getByTestId('quiz-totals')).toContainText('14 درجة');

    // Settings
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('quiz-description').fill('أجب عن جميع الأسئلة.');
    await page.getByTestId('quiz-pass').fill('60');
    await expect(page.getByTestId('quiz-total-points')).toContainText('14');
    await waitSaved(page);
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p3-settings.png`, fullPage: true });

    // Reopen: everything is still there
    await page.reload();
    await expect(page.getByTestId('quiz-title-field')).toHaveValue('اختبار الطاقة المتجددة');
    await expect(page.getByTestId('quiz-description')).toHaveValue('أجب عن جميع الأسئلة.');
    await page.getByTestId('tab-questions').click();
    expect(await page.getByTestId('question').evaluateAll((els) => els.map((e) => e.getAttribute('data-type')))).toEqual(['mcq', 'mcq', 'truefalse', 'short', 'matching', 'ordering', 'fill']);
    await expect(page.getByTestId('question').nth(1).getByTestId('mcq-correct').nth(2)).toBeChecked();
    await expect(page.getByTestId('question').nth(4).getByTestId('pair-right').nth(2)).toHaveValue('سدود');
    await expect(page.getByTestId('question').nth(6).getByTestId('fill-text')).toHaveValue('من مصادر الطاقة المتجددة [[الشمس]] و[[الرياح|الهواء]].');
    await expect(page.getByTestId('question').first().getByTestId('q-issues')).toContainText('مكتمل');
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p3-editor.png`, fullPage: true });

    // ── Student ──
    await startAs(page, 'اختبار الطاقة المتجددة', 'سارة');
    await expect(page.getByTestId('take-progress')).toHaveText('أجبت عن 0 من 7');
    await current(page).getByRole('radio', { name: 'الشمس' }).check(); // q1 correct → 2
    await next(page);
    await current(page).getByRole('checkbox', { name: 'الشمس' }).check(); // q2 one of two → 1 of 2
    await next(page);
    await page.getByTestId('take-true').check(); // q3 wrong → 0
    await page.getByTestId('take-flag').click();
    await next(page);
    await page.getByTestId('take-short').fill('شمس'); // q4 accepted without «ال» → 1
    await next(page);
    const m = current(page).getByTestId('take-match');
    await m.nth(0).selectOption({ label: 'ألواح شمسية' });
    await m.nth(1).selectOption({ label: 'سدود' }); // wrong
    await m.nth(2).selectOption({ label: 'سدود' }); // right → 2 of 3 pairs = 2
    await next(page);
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p3-take.png`, fullPage: true });
    await arrange(page, ['تدور الشفرات', 'يعمل المولد', 'تنتقل الكهرباء']); // q6 → 3
    await next(page);
    await current(page).getByTestId('take-blank').nth(0).fill('الشمس'); // right
    await current(page).getByTestId('take-blank').nth(1).fill('الماء'); // wrong → 1 of 2

    // Navigator shows progress and the flag; review lists every question
    await expect(page.getByTestId('take-progress')).toHaveText('أجبت عن 7 من 7');
    await expect(page.getByTestId('qnav-btn').nth(2)).toHaveAccessibleName(/معلَّم للمراجعة/);
    await page.getByTestId('take-to-review').click();
    await expect(page.getByTestId('review-summary')).toContainText('أجبت عن 7 من 7');
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p3-review.png`, fullPage: true });
    await page.getByTestId('take-submit').click();

    // 2 + 1 + 0 + 1 + 2 + 3 + 1 = 10 of 14 = 71.4 % ≥ 60 % → pass
    await expect(page.getByTestId('result-score')).toHaveText('10 / 14');
    await expect(page.getByTestId('result-percent')).toHaveText('71.4٪');
    await expect(page.getByTestId('result-verdict')).toContainText('ناجح');
    const items = page.getByTestId('review-item');
    await expect(items).toHaveCount(7);
    expect(await items.evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))).toEqual(['correct', 'partial', 'incorrect', 'correct', 'partial', 'correct', 'partial']);
    await expect(items.nth(2).getByTestId('review-correct')).toHaveText('خطأ');
    await expect(items.nth(2).getByTestId('review-feedback')).toContainText('غير متجدد');
    await expect(items.nth(4).getByTestId('review-correct')).toContainText('الرياح ← توربينات');
    await expect(items.nth(6).getByTestId('review-correct')).toContainText('الرياح أو الهواء');
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p3-result.png`, fullPage: true });

    // The attempt is in the results, with per-objective performance
    await page.goto('./#/results');
    await page.getByTestId('results-row').first().click();
    await expect(page.getByTestId('sum-attempts')).toHaveText('1');
    await expect(page.getByTestId('sum-average')).toHaveText('71.4٪');
    await expect(page.getByTestId('objective-stat')).toHaveCount(2);
    // objective 1 (q1 2/2, q2 1/2, q4 1/1, q7 1/2 → 5/7), objective 2 (q3 0/1, q5 2/3, q6 3/3 → 5/7)
    await expect(page.getByTestId('objective-stat')).toHaveText([/71\.4٪/, /71\.4٪/]);
    await expect(page.getByTestId('question-stat').first()).toHaveAttribute('data-difficult', 'true'); // q3: 0 %
  });

  test('scoring edge cases: a score exactly on the pass mark passes; the teacher reviews an uncertain short answer', async ({ page }) => {
    test.setTimeout(180_000);
    await lessonWithObjectives(page);
    await newQuiz(page, 'اختبار قصير');
    let c = await addQuestion(page, 'truefalse');
    await common(c, { prompt: 'الشمس نجم.', points: '3', feedbackBad: 'الشمس نجم.', objectives: [0] });
    await c.getByTestId('tf-true').click();
    c = await addQuestion(page, 'short');
    await common(c, { prompt: 'ما مصدر طاقة الرياح الأصلي؟', points: '2', feedbackBad: 'الشمس تسخن الهواء فتتحرك الرياح.', objectives: [1] });
    await c.getByTestId('short-accepted').first().fill('الشمس');
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('quiz-pass').fill('60');
    await waitSaved(page);

    // 3 / 5 = 60 % exactly → pass
    await startAs(page, 'اختبار قصير', 'خالد');
    await page.getByTestId('take-true').check();
    await next(page);
    await page.getByTestId('take-short').fill('القمر');
    await page.getByTestId('take-to-review').click();
    await page.getByTestId('take-submit').click();
    await expect(page.getByTestId('result-score')).toHaveText('3 / 5');
    await expect(page.getByTestId('result-percent')).toHaveText('60٪');
    await expect(page.getByTestId('result-verdict')).toContainText('ناجح');

    // Uncertain answer → provisional, waiting for the teacher
    await startAs(page, 'اختبار قصير', 'ليلى');
    await page.getByTestId('take-false').check();
    await next(page);
    await page.getByTestId('take-short').fill('أظن أنها الشمس');
    await page.getByTestId('take-to-review').click();
    await page.getByTestId('take-submit').click();
    await expect(page.getByTestId('result-score')).toHaveText('0 / 5');
    await expect(page.getByTestId('result-pending')).toBeVisible();
    await expect(page.getByTestId('result-verdict')).toContainText('لم تبلغ');

    // Teacher reviews it from the results page
    await page.goto('./#/results');
    await page.getByTestId('results-row').first().click();
    await expect(page.getByTestId('review-queue')).toContainText('ليلى');
    await page.getByTestId('open-review').click();
    await expect(page.getByTestId('attempt-verdict')).toHaveText('مبدئية');
    await page.getByTestId('teacher-decision').getByTestId('decide-correct').click();
    await expect(page.getByTestId('attempt-score')).toHaveText('2/5');
    await expect(page.getByTestId('attempt-percent')).toHaveText('40٪');
    await expect(page.getByTestId('attempt-verdict')).toHaveText('غير ناجح');
    await page.reload();
    await expect(page.getByTestId('attempt-score')).toHaveText('2/5');
    await page.goBack();
    await page.goto('./#/results');
    await page.getByTestId('results-row').first().click();
    await expect(page.getByTestId('review-queue')).toHaveCount(0);
    await expect(page.getByTestId('sum-attempts')).toHaveText('2');
    await expect(page.getByTestId('sum-pass')).toHaveText('50٪');
  });

  test('settings that change the student experience all take effect', async ({ page }) => {
    test.setTimeout(180_000);
    await lessonWithObjectives(page);
    await newQuiz(page, 'اختبار الإعدادات');
    for (let i = 1; i <= 6; i++) {
      const c = await addQuestion(page, 'truefalse');
      await common(c, { prompt: `العبارة رقم ${i}`, points: '1', feedbackBad: `تفسير ${i}` });
      await c.getByTestId('tf-true').click();
    }
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('set-shuffle-q').check();
    await page.getByTestId('set-show-score').uncheck();
    await page.getByTestId('set-show-correct').uncheck();
    await page.getByTestId('set-show-feedback').uncheck();
    await page.getByTestId('quiz-attempts').fill('2');
    await waitSaved(page);

    const orders: string[][] = [];
    for (const name of ['منى', 'منى']) {
      await startAs(page, 'اختبار الإعدادات', name);
      const titles: string[] = [];
      for (let i = 0; i < 6; i++) {
        titles.push((await page.getByTestId('take-q-title').textContent()) ?? '');
        await page.getByTestId('take-true').check();
        if (i < 5) await next(page);
      }
      orders.push(titles);
      await page.getByTestId('take-to-review').click();
      await page.getByTestId('take-submit').click();
      // score, correctness and feedback hidden by the teacher's settings
      await expect(page.getByTestId('result-hidden')).toBeVisible();
      await expect(page.getByText('تم التسليم')).toBeVisible();
      await expect(page.getByTestId('result-score')).toHaveCount(0);
      await expect(page.getByTestId('result-percent')).toHaveCount(0);
      await expect(page.getByTestId('result-details')).toHaveCount(0);
    }
    // shuffled: the same six questions, in an order other than the author's in at least one attempt
    const author = [1, 2, 3, 4, 5, 6].map((i) => `العبارة رقم ${i}`);
    for (const o of orders) expect([...o].sort()).toEqual([...author].sort());
    expect(orders.some((o) => o.join() !== author.join())).toBe(true);

    // two attempts allowed → the third is refused for the same name, allowed for another student
    await chooseStudent(page, 'منى');
    await expect(quizRow(page, 'اختبار الإعدادات').getByTestId('student-quiz-limit')).toBeVisible();
    await expect(quizRow(page, 'اختبار الإعدادات').getByTestId('student-quiz-go')).toHaveCount(0);
    await expect(quizRow(page, 'اختبار الإعدادات').getByTestId('student-quiz-status')).toContainText('محاولتان');
    await openQuizAs(page, 'اختبار الإعدادات', 'هدى');
    await expect(page.getByTestId('take-start')).toBeEnabled();

    // Teacher test runs never count and never use up attempts
    await page.goto('./#/quizzes');
    await page.getByRole('link', { name: 'فتح الاختبار: اختبار الإعدادات' }).click();
    await page.getByTestId('try-quiz').click();
    await expect(page.getByTestId('preview-banner')).toBeVisible();
    await page.getByTestId('take-start').click();
    await page.getByTestId('take-true').check();
    await page.getByTestId('go-review').click();
    await page.getByTestId('take-submit').click();
    await page.getByTestId('confirm-submit').getByRole('button', { name: 'تسليم الآن' }).click();
    await expect(page.getByTestId('take-result')).toBeVisible();
    await page.goto('./#/results');
    await page.getByTestId('results-row').first().click();
    await expect(page.getByTestId('sum-attempts')).toHaveText('2');
  });

  test('time limit: the countdown shows and the quiz is submitted automatically when time is up', async ({ page }) => {
    test.setTimeout(180_000);
    await lessonWithObjectives(page);
    await newQuiz(page, 'اختبار موقوت');
    for (let i = 1; i <= 2; i++) {
      const c = await addQuestion(page, 'truefalse');
      await common(c, { prompt: `عبارة ${i}`, points: '1', feedbackBad: 'تفسير' });
      await c.getByTestId('tf-true').click();
    }
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('quiz-time').fill('1');
    await waitSaved(page);

    await page.clock.install();
    await startAs(page, 'اختبار موقوت', 'يوسف');
    await expect(page.getByTestId('take-timer')).toContainText('01:00');
    await page.getByTestId('take-true').check(); // one answer before time runs out
    await page.waitForTimeout(500); // let the answer be saved
    await page.clock.fastForward('00:30');
    await expect(page.getByTestId('take-timer')).toContainText('00:3');
    await page.clock.fastForward('00:31');
    await expect(page.getByTestId('take-result')).toBeVisible();
    await expect(page.getByText('سُلّم تلقائيًا عند انتهاء الوقت')).toBeVisible();
    await expect(page.getByTestId('result-score')).toHaveText('1 / 2');
    await page.goto('./#/results');
    await page.getByTestId('results-row').first().click();
    await expect(page.getByTestId('attempt-row').first()).toContainText('انتهى الوقت');
  });

  test('attempts, answers and results survive closing the browser with no network; an open attempt resumes', async ({}, testInfo) => {
    test.setTimeout(240_000);
    const dir = newProfileDir();
    const base = String(testInfo.project.use.baseURL);
    const ctx1 = await launchProfile(dir, testInfo);
    const p1 = ctx1.pages()[0] ?? (await ctx1.newPage());
    await primeOffline(p1);
    await disableSplash(p1);
    await ctx1.setOffline(true); // everything below happens offline
    await lessonWithObjectives(p1);
    await newQuiz(p1, 'اختبار دون إنترنت');
    let c = await addQuestion(p1, 'mcq');
    await common(c, { prompt: 'أي مصدر متجدد؟', points: '1', feedbackBad: 'الشمس', objectives: [0] });
    await mcq(c, ['الشمس', 'الفحم'], [0]);
    c = await addQuestion(p1, 'short');
    await common(c, { prompt: 'اكتب مصدرًا متجددًا آخر.', points: '1', feedbackBad: 'مثل الرياح.', objectives: [0] });
    await c.getByTestId('short-accepted').first().fill('الرياح');
    await waitSaved(p1);
    // a submitted attempt
    await startAs(p1, 'اختبار دون إنترنت', 'ريم');
    await current(p1).getByRole('radio', { name: 'الشمس' }).check();
    await next(p1);
    await p1.getByTestId('take-short').fill('رياح');
    await p1.getByTestId('take-to-review').click();
    await p1.getByTestId('take-submit').click();
    await expect(p1.getByTestId('result-score')).toHaveText('2 / 2');
    // an attempt left half-way
    await startAs(p1, 'اختبار دون إنترنت', 'عمر');
    await current(p1).getByRole('radio', { name: 'الفحم' }).check();
    await p1.waitForTimeout(600); // answer saved locally
    await ctx1.close();

    const ctx2 = await launchProfile(dir, testInfo);
    await ctx2.setOffline(true);
    const page = ctx2.pages()[0] ?? (await ctx2.newPage());
    const net = watchNetwork(page, base);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('./#/results');
    await page.getByTestId('results-row').first().click();
    await expect(page.getByTestId('sum-attempts')).toHaveText('1');
    await expect(page.getByTestId('attempt-row').first()).toContainText('ريم');
    await expect(page.getByTestId('attempt-row').first()).toContainText('2/2');
    // resume the open attempt with its saved answer
    await chooseStudent(page, 'عمر');
    await expect(quizRow(page, 'اختبار دون إنترنت').getByTestId('student-quiz-status')).toHaveText('محاولة لم تُسلَّم بعد');
    await quizRow(page, 'اختبار دون إنترنت').getByTestId('student-quiz-go').click();
    await page.getByTestId('take-resume').click();
    await expect(page.getByTestId('take-progress')).toHaveText('أجبت عن 1 من 2');
    await page.getByTestId('take-prev').click();
    await expect(current(page).getByRole('radio', { name: 'الفحم' })).toBeChecked();
    await current(page).getByRole('radio', { name: 'الشمس' }).check();
    await next(page);
    await page.getByTestId('take-short').fill('الماء');
    await page.getByTestId('take-to-review').click();
    await page.getByTestId('take-submit').click();
    await expect(page.getByTestId('result-score')).toHaveText('1 / 2');
    expect(net.external).toEqual([]);
    expect(net.failed).toEqual([]);
    expect(errors).toEqual([]);
    await ctx2.close();
  });

  test('quiz screens fit the device and pass accessibility checks; phones work by touch', async ({ page }, info) => {
    test.setTimeout(240_000);
    await lessonWithObjectives(page);
    await newQuiz(page, 'اختبار العرض');
    let c = await addQuestion(page, 'mcq');
    await common(c, { prompt: 'سؤال اختيار من متعدد بنص طويل نسبيًا ليختبر التفاف النص على الشاشات الصغيرة دون أن يخرج عن حدودها', points: '1', feedbackBad: 'تفسير', objectives: [0] });
    await mcq(c, ['خيار أول طويل بعض الشيء', 'خيار ثانٍ', 'خيار ثالث', 'خيار رابع'], [0]);
    c = await addQuestion(page, 'matching');
    await common(c, { prompt: 'طابق', points: '2', feedbackBad: 'تفسير', objectives: [1] });
    await pairs(c, [
      ['الشمس', 'ألواح'],
      ['الرياح', 'توربينات'],
      ['الماء', 'سدود'],
    ]);
    c = await addQuestion(page, 'fill');
    await common(c, { points: '1', feedbackBad: 'تفسير', objectives: [0] });
    await c.getByTestId('fill-text').fill('أكبر مصدر للطاقة هو [[الشمس]] ويليه [[الرياح]].');
    await waitSaved(page);

    const vw = page.viewportSize()!.width;
    const fits = async (label: string) => {
      const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(scrollW, `overflow: ${label}`).toBeLessThanOrEqual(vw);
      expect(innerW, `zoomed out: ${label}`).toBe(vw);
    };
    const axe = async (label: string) => {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(bad, label).toEqual([]);
    };
    await fits('editor');
    await axe('editor');
    await page.getByTestId('tab-settings').click();
    await fits('settings');
    await axe('settings');

    const phone = isPhone(info.project.name);
    const press = (l: ReturnType<Page['getByTestId']>) => (phone ? l.tap() : l.click());
    await page.goto('./#/learn');
    await fits('student: who are you');
    await axe('student: who are you');
    await page.getByTestId('learn-name').fill('نور');
    await press(page.getByTestId('learn-continue'));
    await expect(page.getByTestId('page-learn')).toBeVisible();
    await fits('student home');
    await axe('student home');
    await press(quizRow(page, 'اختبار العرض').getByTestId('student-quiz-go'));
    await press(page.getByTestId('take-start'));
    await fits('question');
    await axe('question');
    const opt = current(page).locator('.choice').first();
    const box = (await opt.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    await press(opt);
    await expect(current(page).getByRole('radio').first()).toBeChecked();
    // keyboard: arrow keys move between radio options
    await current(page).getByRole('radio').first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(current(page).getByRole('radio').nth(1)).toBeChecked();
    await press(page.getByTestId('take-next'));
    await current(page).getByTestId('take-match').nth(0).selectOption({ label: 'ألواح' });
    await fits('matching');
    await axe('matching');
    await press(page.getByTestId('take-next'));
    await current(page).getByTestId('take-blank').nth(0).fill('الشمس');
    await fits('fill');
    await axe('fill');
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p3-take-fill.png`, fullPage: true });
    await press(page.getByTestId('take-to-review'));
    await fits('review');
    await axe('review');
    await press(page.getByTestId('take-submit'));
    await press(page.getByTestId('confirm-submit').getByRole('button', { name: 'تسليم الآن' }));
    await expect(page.getByTestId('take-result')).toBeVisible();
    await fits('result');
    await axe('result');
    await page.goto('./#/results');
    await page.getByTestId('results-row').first().click();
    await fits('results');
    await axe('results');
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p3-results.png`, fullPage: true });
    await press(page.getByTestId('attempt-row').first().locator('.attempt-main'));
    await fits('attempt');
    await axe('attempt');
  });

  test('quizzes appear on the project page and objectives show how many questions measure them', async ({ page }) => {
    test.setTimeout(180_000);
    await lessonWithObjectives(page);
    await newQuiz(page, 'اختبار المشروع');
    const c = await addQuestion(page, 'truefalse');
    await common(c, { prompt: 'عبارة', points: '1', feedbackBad: 'تفسير', objectives: [0] });
    await c.getByTestId('tf-true').click();
    await waitSaved(page);
    await page.goto('./#/projects');
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-quizzes')).toContainText('اختبار المشروع');
    await page.getByRole('button', { name: 'فتح محرر الدرس: مصادر الطاقة' }).click();
    await page.getByTestId('tab-alignment').click();
    // no content blocks yet, so the matrix shows the empty state; the "unassessed" note lists objective 2 only
    await expect(page.getByTestId('alignment-unassessed')).toContainText('الهدف 2');
    await expect(page.getByTestId('alignment-unassessed')).not.toContainText('الهدف 1،');
  });
});
