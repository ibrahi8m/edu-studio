import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { launchProfile, newProfileDir, primeOffline, settleAfterAdd, watchNetwork } from './helpers';
import { addQuestion, chooseStudent, common, current, disableSplash, isPhone, lessonWithObjectives, mcq, newQuiz, quizRow, waitSaved } from './quiz-helpers';

const FX = (f: string) => fileURLToPath(new URL(`../fixtures/${f}`, import.meta.url));

/* ───────── building blocks (teacher side, through the real UI) ───────── */

async function addBlock(page: Page, type: string): Promise<Locator> {
  await page.getByTestId('add-block').last().click();
  await page.getByTestId(`add-${type}`).click();
  await expect(page.getByTestId('add-block-dialog')).toBeHidden();
  await settleAfterAdd(page);
  return page.getByTestId('block').last();
}

/** Lesson «مصادر الطاقة» with two objectives and content in two main parts (+ content before the first heading). */
async function lessonWithContent(page: Page) {
  await lessonWithObjectives(page); // leaves the lesson editor open
  await page.getByTestId('tab-content').click();
  let b = await addBlock(page, 'text');
  await b.getByTestId('text-body').fill('مقدمة: الطاقة حولنا في كل مكان.');
  b = await addBlock(page, 'heading');
  await b.getByTestId('heading-text').fill('الطاقة المتجددة');
  b = await addBlock(page, 'text');
  await b.getByTestId('text-body').fill('الشمس والرياح **لا تنفدان**.');
  b = await addBlock(page, 'image');
  await b.getByTestId('image-input').setInputFiles(FX('energy-diagram.png'));
  await expect(b.getByTestId('image-preview')).toBeVisible();
  await b.getByTestId('image-alt').fill('رسم للألواح الشمسية');
  b = await addBlock(page, 'cards');
  await b.getByTestId('card-front').nth(0).fill('توربين');
  await b.getByTestId('card-back').nth(0).fill('يحوّل حركة الرياح إلى كهرباء');
  b = await addBlock(page, 'heading');
  await b.getByTestId('heading-text').fill('نشاط ختامي');
  b = await addBlock(page, 'summary');
  await b.getByTestId('summary-title').fill('خلاصة');
  await b.getByTestId('point-title').nth(0).fill('الشمس مصدر متجدد');
  b = await addBlock(page, 'activity');
  await b.getByTestId('activity-title').fill('صنّف المصادر');
  await b.getByTestId('activity-steps').fill('اقرأ\nصنّف\nناقش');
  await waitSaved(page);
}

/** Quiz linked to the lesson: MCQ (one answer) 2 pts, MCQ (several answers, partial) 2 pts, true/false 1 pt. */
async function lessonQuiz(page: Page, title: string, settings: { immediate?: boolean; attempts?: string; policy?: 'best' | 'last' | 'first' } = {}) {
  await newQuiz(page, title);
  let c = await addQuestion(page, 'mcq');
  await common(c, { prompt: 'أي مصدر متجدد؟', points: '2', feedbackOk: 'أحسنت.', feedbackBad: 'الشمس لا تنفد.', objectives: [0] });
  await mcq(c, ['الشمس', 'الفحم', 'النفط'], [0]);
  await c.getByRole('button', { name: '+ تغذية راجعة لهذا الخيار' }).nth(1).click();
  await c.getByRole('textbox', { name: 'تغذية راجعة للخيار 2' }).fill('الفحم وقود أحفوري ينفد.');
  c = await addQuestion(page, 'mcq');
  await common(c, { prompt: 'اختر كل المصادر المتجددة', points: '2', feedbackBad: 'الرياح والشمس.', objectives: [1] });
  await mcq(c, ['الرياح', 'الفحم', 'الشمس', 'النفط'], [0, 2], true);
  c = await addQuestion(page, 'truefalse');
  await common(c, { prompt: 'النفط مصدر متجدد.', points: '1', feedbackBad: 'النفط ينفد.', objectives: [0] });
  await c.getByTestId('tf-false').click();
  await c.getByTestId('q-bloom').selectOption('2'); // this one measures "الفهم"
  await page.getByTestId('tab-settings').click();
  if (settings.immediate) await page.getByTestId('set-feedback-timing').selectOption('immediate');
  if (settings.attempts) await page.getByTestId('quiz-attempts').fill(settings.attempts);
  if (settings.policy) await page.getByTestId('set-score-policy').selectOption(settings.policy);
  await waitSaved(page);
}

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

/** Goes to a lesson part from the part list (a disclosure on phones and tablets, a side list on computers). */
async function openPart(page: Page, title: string) {
  const side = page.locator('.lp-toc');
  if (await side.isVisible()) await side.getByRole('button', { name: new RegExp(`^${title}`) }).click();
  else {
    const d = page.locator('.lp-toc-mobile');
    if (!(await d.evaluate((e: HTMLDetailsElement) => e.open))) await d.locator('summary').click();
    await d.getByRole('button', { name: new RegExp(`^${title}`) }).click();
  }
}

test.describe('Phase 4 — student mode and results', () => {
  test.beforeEach(async ({ page }) => {
    await disableSplash(page);
  });

  test('a lesson in student mode: its own interface, every kind of content, parts, progress kept after reopening; RTL, fits, accessible', async ({ page }, info) => {
    test.setTimeout(240_000);
    await lessonWithContent(page);
    await lessonQuiz(page, 'اختبار الدرس');
    const shots = `docs/screenshots/${info.project.name}`;

    await page.goto('./#/learn');
    await expect(page.getByTestId('page-learn-who')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    // separate from the teacher's interface: no sidebar, no bottom navigation, no editing links
    await expect(page.locator('.sidebar, .bottom-nav')).toHaveCount(0);
    await fits(page, 'who');
    expect(await serious(page), 'who').toEqual([]);
    await page.getByTestId('learn-continue').click();
    await expect(page.getByRole('alert')).toHaveText('اكتب اسمك للمتابعة.');
    await page.getByTestId('learn-name').fill('سلمى');
    await page.getByTestId('learn-continue').click();
    await expect(page.getByTestId('student-chip')).toHaveText('سلمى');
    const row = page.locator('[data-testid="learn-lesson"][data-lesson="مصادر الطاقة"]');
    await expect(row.getByTestId('lesson-progress-text')).toHaveText('لم تبدأ بعد · الأنشطة 0/3');
    await expect(quizRow(page, 'اختبار الدرس').getByTestId('student-quiz-status')).toHaveText('لم تبدأه بعد');
    await fits(page, 'student home');
    expect(await serious(page), 'student home').toEqual([]);
    await page.screenshot({ path: `${shots}/p4-learn-home.png`, fullPage: true });

    await row.getByTestId('open-lesson').click();
    await expect(page.getByTestId('page-lesson-player')).toBeVisible();
    // no teacher tools anywhere in the student's lesson
    await expect(page.getByTestId('back-to-editor')).toHaveCount(0);
    await expect(page.getByTestId('toggle-teacher-notes')).toHaveCount(0);
    await expect(page.getByTestId('teacher-panel')).toHaveCount(0);
    await expect(page.locator('textarea, [contenteditable="true"], .sidebar, .bottom-nav')).toHaveCount(0);
    await expect(page.locator('.bloom-tag')).toHaveCount(0);

    // part 1: start and objectives
    await expect(page.getByTestId('lp-part')).toHaveAttribute('data-section', 'intro');
    await expect(page.getByTestId('lv-title')).toHaveText('مصادر الطاقة');
    await expect(page.locator('.lv-objectives li')).toHaveCount(2);
    await expect(page.getByTestId('lp-intro-count')).toHaveText('في هذا الدرس 3 أقسام محتوى واختبار واحد في الختام.');
    await expect(page.getByTestId('lp-progress-text')).toHaveText('فتحت 1 من 5 أقسام');
    await fits(page, 'lesson intro');
    expect(await serious(page), 'lesson intro').toEqual([]);
    await page.screenshot({ path: `${shots}/p4-lesson-intro.png`, fullPage: true });

    // part 2: content before the first heading
    await page.getByTestId('lp-next').click();
    await expect(page.getByTestId('lp-part-title')).toHaveText('المحتوى');
    await expect(page.getByTestId('lp-part-title')).toBeFocused();
    await expect(page.locator('.lp-part .rich-text')).toHaveText('مقدمة: الطاقة حولنا في كل مكان.');

    // part 3: text, image, cards
    await page.getByTestId('lp-next').click();
    await expect(page.getByTestId('lp-part-title')).toHaveText('الطاقة المتجددة');
    await expect(page.locator('.lp-part .rich-text strong')).toHaveText('لا تنفدان');
    const img = page.getByTestId('lv-image');
    await expect(img).toHaveAttribute('alt', 'رسم للألواح الشمسية');
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    const card = page.getByTestId('flip-card').first();
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.lv-cards .lv-count')).toHaveText('1/1');
    await fits(page, 'content part');
    expect(await serious(page), 'content part').toEqual([]);
    await page.screenshot({ path: `${shots}/p4-lesson-part.png`, fullPage: true });

    // jump straight to the end: finishing is refused and the unopened part is named
    await openPart(page, 'الختام والاختبارات');
    await expect(page.getByTestId('lp-part')).toHaveAttribute('data-section', 'end');
    await page.getByTestId('finish-lesson').click();
    await expect(page.getByTestId('lesson-missing')).toContainText('بقي قسم واحد لم تفتحه:');
    await expect(page.getByTestId('lesson-missing')).toContainText('نشاط ختامي');
    await expect(page.getByTestId('lesson-done')).toHaveCount(0);

    // part 4 (via the link in the message): summary and activity; tick a step
    await page.getByTestId('lesson-missing').getByRole('button', { name: 'نشاط ختامي' }).click();
    await expect(page.getByTestId('lp-part-title')).toHaveText('نشاط ختامي');
    await expect(page.locator('.lp-part .summary-points li')).toHaveCount(1);
    await page.getByTestId('activity-step').first().click();
    await expect(page.getByTestId('activity-step').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('activity-progress')).toHaveText('1/3 خطوات');
    await expect(page.getByTestId('lp-progress-text')).toHaveText('فتحت 5 من 5 أقسام');

    // close and reopen: same place, same progress
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByTestId('lp-part-title')).toHaveText('نشاط ختامي');
    await expect(page.getByTestId('activity-step').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('lp-progress-text')).toHaveText('فتحت 5 من 5 أقسام');

    await page.getByTestId('lp-next').click();
    await expect(page.getByTestId('lp-end-activities')).toHaveText('خطوات الأنشطة: أنجزت 1 من 3');
    await expect(quizRow(page, 'اختبار الدرس')).toBeVisible();
    await page.getByTestId('finish-lesson').click();
    await expect(page.getByTestId('lesson-done')).toBeVisible();
    await expect(page.getByTestId('lp-progress-text')).toHaveText('أكملت الدرس');
    await fits(page, 'lesson end');
    expect(await serious(page), 'lesson end').toEqual([]);
    await page.screenshot({ path: `${shots}/p4-lesson-end.png`, fullPage: true });

    // the student's home shows it; another student on this device starts from zero
    await page.getByTestId('back-to-lessons').click();
    await expect(row.getByTestId('lesson-progress-text')).toHaveText('أكملت الدرس · الأنشطة 1/3');
    await chooseStudent(page, 'باسل');
    await expect(row.getByTestId('lesson-progress-text')).toHaveText('لم تبدأ بعد · الأنشطة 0/3');
    await chooseStudent(page, 'سلمى');
    await expect(row.getByTestId('lesson-progress-text')).toHaveText('أكملت الدرس · الأنشطة 1/3');

    // leaving student mode returns to the teacher's interface
    await page.getByTestId('exit-student').click();
    await expect(page.getByTestId('page-dashboard')).toBeVisible();
  });

  test('quiz from the lesson: feedback after each answer, one and several correct answers, exact score; a retry keeps both attempts; results by student, objective and Bloom level', async ({ page }, info) => {
    test.setTimeout(300_000);
    const phone = isPhone(info.project.name);
    const shots = `docs/screenshots/${info.project.name}`;
    await lessonWithObjectives(page);
    await lessonQuiz(page, 'اختبار فوري', { immediate: true, attempts: '2', policy: 'best' });
    // Bloom distribution in the editor: two questions inherit their objectives' levels, one is tagged "الفهم"
    await page.getByTestId('tab-questions').click();
    await expect(page.locator('[data-testid="bloom-count"][data-level="1"]')).toHaveText('التذكر 1');
    await expect(page.locator('[data-testid="bloom-count"][data-level="2"]')).toHaveText('الفهم 1');
    await expect(page.locator('[data-testid="bloom-count"][data-level="4"]')).toHaveText('التحليل 1');
    await expect(page.getByTestId('bloom-warning')).toHaveCount(0);

    await chooseStudent(page, 'سلمى');
    await quizRow(page, 'اختبار فوري').getByTestId('student-quiz-go').click();
    await expect(page.getByTestId('take-who')).toContainText('سلمى');
    await expect(page.getByTestId('take-rules')).toContainText('بعد كل سؤال');
    await expect(page.getByTestId('take-policy')).toContainText('أعلى محاولة');
    await page.getByTestId('take-start').click();

    // Q1, one correct answer: choose the wrong one, check → locked, verdict, the option's own feedback, the correct answer
    await expect(page.getByTestId('take-check')).toBeDisabled();
    await current(page).getByRole('radio', { name: 'الفحم' }).check();
    await page.getByTestId('take-check').click();
    const fb = page.getByTestId('instant-feedback');
    await expect(fb).toHaveAttribute('data-status', 'incorrect');
    await expect(fb).toContainText('خاطئة · 0/2');
    await expect(page.getByTestId('instant-correct')).toContainText('الشمس');
    await expect(page.getByTestId('instant-text')).toHaveText('الشمس لا تنفد.');
    await expect(page.getByTestId('instant-option-feedback')).toContainText('الفحم وقود أحفوري ينفد.');
    await expect(page.getByTestId('take-answer-area')).toHaveAttribute('data-locked', 'true');
    await expect(current(page).getByRole('radio', { name: 'الشمس' })).toBeDisabled();
    await fits(page, 'instant feedback');
    expect(await serious(page), 'instant feedback').toEqual([]);
    await page.screenshot({ path: `${shots}/p4-instant-feedback.png`, fullPage: true });

    // Q2, several correct answers: one right + one wrong → (1-1)/2 = 0 ; checked
    await page.getByTestId('take-next').click();
    await current(page).getByRole('checkbox', { name: 'الرياح' }).check();
    await current(page).getByRole('checkbox', { name: 'الفحم' }).check();
    await page.getByTestId('take-check').click();
    await expect(page.getByTestId('instant-feedback')).toHaveAttribute('data-status', 'incorrect');
    // Q3 true/false: right
    await page.getByTestId('take-next').click();
    await page.getByTestId('take-false').check();
    await page.getByTestId('take-check').click();
    await expect(page.getByTestId('instant-feedback')).toContainText('صحيحة · 1/1');
    // going back shows the locked answer and its verdict again
    await page.getByTestId('take-prev').click();
    await expect(current(page).getByRole('checkbox', { name: 'الفحم' })).toBeChecked();
    await expect(current(page).getByRole('checkbox', { name: 'الفحم' })).toBeDisabled();
    await page.getByTestId('go-review').click();
    await page.getByTestId('take-submit').click();
    await expect(page.getByTestId('result-score')).toHaveText('1 / 5'); // 0 + 0 + 1
    await expect(page.getByTestId('result-percent')).toHaveText('20٪');
    await expect(page.getByTestId('result-attempt-no')).toHaveText('المحاولة 1');

    // retry: explicit confirmation that nothing is overwritten
    await page.getByTestId('take-again').click();
    const dlg = page.getByTestId('confirm-again');
    await expect(dlg).toContainText('ستبدأ المحاولة 2 من 2.');
    await expect(dlg).toContainText('محاولاتك السابقة ونتائجها تبقى محفوظة ولا تُستبدل.');
    await dlg.getByRole('button', { name: 'ابدأ محاولة جديدة' }).click();
    await expect(page.getByTestId('take-history')).toContainText('المحاولة 1');
    await expect(page.getByTestId('take-history')).toContainText('1/5 (20٪)');
    await page.getByTestId('take-start').click();
    await current(page).getByRole('radio', { name: 'الشمس' }).check();
    await page.getByTestId('take-check').click();
    await page.getByTestId('take-next').click();
    await current(page).getByRole('checkbox', { name: 'الرياح' }).check();
    await current(page).getByRole('checkbox', { name: 'الشمس' }).check();
    await page.getByTestId('take-check').click();
    await expect(page.getByTestId('instant-feedback')).toContainText('صحيحة · 2/2');
    await page.getByTestId('take-next').click();
    await page.getByTestId('take-false').check();
    await page.getByTestId('take-check').click();
    await page.getByTestId('take-to-review').click();
    await page.getByTestId('take-submit').click();
    await expect(page.getByTestId('result-score')).toHaveText('5 / 5');
    await expect(page.getByTestId('result-attempt-no')).toHaveText('المحاولة 2 من 2 محاولات محفوظة');
    await expect(page.getByTestId('result-counted')).toContainText('المحاولة هذه — 100٪');
    await expect(page.getByTestId('take-again')).toHaveCount(0); // 2 of 2 used
    await page.screenshot({ path: `${shots}/p4-result-retry.png`, fullPage: true });
    await page.getByRole('button', { name: 'إنهاء' }).click();
    // back where the quiz was opened from (the lesson's last part): both attempts counted, the best one shown, no more attempts
    await expect(page.getByTestId('page-lesson-player')).toBeVisible();
    await expect(page.getByTestId('lp-part')).toHaveAttribute('data-section', 'end');
    await expect(quizRow(page, 'اختبار فوري').getByTestId('student-quiz-status')).toHaveText('محاولتان · المعتمدة (أعلى محاولة): 100٪');
    await expect(quizRow(page, 'اختبار فوري').getByTestId('student-quiz-limit')).toBeVisible();

    // a second student on the same device: own attempt, own numbers
    await chooseStudent(page, 'باسل');
    await expect(quizRow(page, 'اختبار فوري').getByTestId('student-quiz-status')).toHaveText('لم تبدأه بعد');
    await quizRow(page, 'اختبار فوري').getByTestId('student-quiz-go').click();
    await page.getByTestId('take-start').click();
    await current(page).getByRole('radio', { name: 'الشمس' }).check();
    await page.getByTestId('take-check').click();
    await page.getByTestId('go-review').click();
    await page.getByTestId('take-submit').click();
    await page.getByTestId('confirm-submit').getByRole('button', { name: 'تسليم الآن' }).click();
    await expect(page.getByTestId('result-score')).toHaveText('2 / 5');

    // ── teacher: results ──
    await page.goto('./#/results');
    await expect(page.getByTestId('student-row')).toHaveCount(2);
    const salma = page.getByTestId('student-row').filter({ hasText: 'سلمى' });
    await expect(salma).toContainText('1 اختبار · 2 محاولة');
    await expect(salma.getByTestId('student-average')).toHaveText('المتوسط 100٪'); // best of 20 % and 100 %
    await expect(page.getByTestId('student-row').filter({ hasText: 'باسل' }).getByTestId('student-average')).toHaveText('المتوسط 40٪');
    await page.getByTestId('results-row').first().click();
    await expect(page.getByTestId('sum-attempts')).toHaveText('3');
    await expect(page.getByTestId('sum-average')).toHaveText('53.3٪'); // (20 + 100 + 40) / 3
    await expect(page.getByTestId('quiz-student-row')).toHaveCount(2);
    await expect(page.getByTestId('quiz-student-row').filter({ hasText: 'سلمى' })).toContainText('2 محاولات: 20٪، 100٪');
    await expect(page.getByTestId('quiz-student-row').filter({ hasText: 'سلمى' }).getByTestId('quiz-student-counted')).toHaveText('5/5 · 100٪');
    // Bloom: level 1 = Q1 (2+... ) ; level 2 = Q3 ; level 4 = Q2
    //   Q1 (2 pts): 0 + 2 + 2 = 4/6 · Q3 (1 pt): 1 + 1 + 0 = 2/3 · Q2 (2 pts): 0 + 2 + 0 = 2/6
    const bloom = page.getByTestId('bloom-stats');
    await expect(bloom.locator('[data-level="1"] .obj-bars-n')).toHaveText('66.7٪');
    await expect(bloom.locator('[data-level="2"] .obj-bars-n')).toHaveText('66.7٪');
    await expect(bloom.locator('[data-level="4"] .obj-bars-n')).toHaveText('33.3٪');
    await fits(page, 'quiz results');
    expect(await serious(page), 'quiz results').toEqual([]);
    await page.screenshot({ path: `${shots}/p4-quiz-results.png`, fullPage: true });

    // one student's report: attempts, counted one, objectives mastered vs. to review (from the counted attempt)
    await page.getByTestId('quiz-student-row').filter({ hasText: 'سلمى' }).locator('a').click();
    await expect(page.getByTestId('page-student-report')).toBeVisible();
    await expect(page.getByTestId('st-attempts')).toHaveText('2');
    await expect(page.getByTestId('st-average')).toHaveText('100٪');
    await expect(page.getByTestId('student-attempt')).toHaveCount(2);
    await expect(page.getByTestId('student-quiz-counted')).toHaveText('100٪');
    await expect(page.getByTestId('objectives-mastered').getByTestId('student-objective')).toHaveCount(2);
    await expect(page.getByTestId('objectives-review')).toHaveCount(0);
    await page.goto('./#/results');
    await page.getByTestId('student-row').filter({ hasText: 'باسل' }).locator('a').click();
    // باسل: objective 1 = Q1 (2/2) + Q3 (0/1) = 2/3 → to review ; objective 2 = Q2 0/2 → to review
    await expect(page.getByTestId('objectives-review').getByTestId('student-objective')).toHaveCount(2);
    await expect(page.getByTestId('objectives-mastered')).toHaveCount(0);
    await expect(page.getByTestId('objectives-review')).toContainText('66.7٪');
    await fits(page, 'student report');
    expect(await serious(page), 'student report').toEqual([]);
    await page.screenshot({ path: `${shots}/p4-student-report.png`, fullPage: true });
    void phone;
  });

  test('closing the app during a quiz and after finishing it, offline: answers resume in the same attempt, results and lesson progress stay', async ({}, testInfo) => {
    test.setTimeout(300_000);
    const dir = newProfileDir();
    const base = String(testInfo.project.use.baseURL);
    const ctx1 = await launchProfile(dir, testInfo);
    const p1 = ctx1.pages()[0] ?? (await ctx1.newPage());
    await primeOffline(p1);
    await disableSplash(p1);
    await ctx1.setOffline(true); // everything below happens offline
    await lessonWithObjectives(p1);
    await lessonQuiz(p1, 'اختبار الإغلاق');
    await chooseStudent(p1, 'ريم');
    await p1.locator('[data-testid="learn-lesson"][data-lesson="مصادر الطاقة"]').getByTestId('open-lesson').click();
    await expect(p1.getByTestId('lp-progress-text')).toHaveText('فتحت 1 من 2 أقسام');
    await p1.getByTestId('lp-next').click();
    await quizRow(p1, 'اختبار الإغلاق').getByTestId('student-quiz-go').click();
    await p1.getByTestId('take-start').click();
    await current(p1).getByRole('radio', { name: 'الشمس' }).check();
    await p1.getByTestId('take-next').click();
    await current(p1).getByRole('checkbox', { name: 'الرياح' }).check();
    await p1.waitForTimeout(700); // saved locally while answering
    await ctx1.close(); // app closed in the middle of the quiz

    const ctx2 = await launchProfile(dir, testInfo);
    await ctx2.setOffline(true);
    let page = ctx2.pages()[0] ?? (await ctx2.newPage());
    const net = watchNetwork(page, base);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('./#/learn');
    await expect(page.getByTestId('student-chip')).toHaveText('ريم'); // still the same student
    await expect(quizRow(page, 'اختبار الإغلاق').getByTestId('student-quiz-status')).toHaveText('محاولة لم تُسلَّم بعد');
    await quizRow(page, 'اختبار الإغلاق').getByTestId('student-quiz-go').click();
    await expect(page.getByTestId('take-start')).toHaveCount(0); // only "continue" is offered
    await page.reload(); // reopening the start page again must not create anything new
    await page.getByTestId('take-resume').click();
    await expect(page.getByTestId('take-progress')).toHaveText('أجبت عن 2 من 3');
    await expect(page.getByTestId('take-q-title')).toHaveText('النفط مصدر متجدد.'); // resumes at the first unanswered question
    await page.getByTestId('take-false').check();
    await page.getByTestId('take-prev').click();
    await expect(current(page).getByRole('checkbox', { name: 'الرياح' })).toBeChecked(); // saved before the app was closed
    await current(page).getByRole('checkbox', { name: 'الشمس' }).check();
    await page.getByTestId('take-next').click();
    await page.getByTestId('take-to-review').click();
    await page.getByTestId('take-submit').click();
    await expect(page.getByTestId('result-score')).toHaveText('5 / 5');
    await page.reload(); // reloading the finished quiz must not count it twice
    await expect(page.getByTestId('take-intro')).toBeVisible();
    await expect(page.getByTestId('take-history')).toContainText('5/5 (100٪)');
    await ctx2.close(); // app closed after finishing

    const ctx3 = await launchProfile(dir, testInfo);
    await ctx3.setOffline(true);
    page = ctx3.pages()[0] ?? (await ctx3.newPage());
    const net3 = watchNetwork(page, base);
    await page.goto('./#/learn');
    await expect(quizRow(page, 'اختبار الإغلاق').getByTestId('student-quiz-status')).toHaveText('محاولة واحدة · نتيجتك: 100٪');
    await expect(page.locator('[data-testid="learn-lesson"][data-lesson="مصادر الطاقة"]').getByTestId('lesson-progress-text')).toHaveText('فتحت 2 من 2 أقسام');
    await page.goto('./#/results');
    await page.getByTestId('results-row').first().click();
    await expect(page.getByTestId('sum-attempts')).toHaveText('1');
    await expect(page.getByTestId('attempt-row')).toHaveCount(1);
    await expect(page.getByTestId('attempt-row').first()).toContainText('5/5');
    await page.goto('./#/results');
    await page.getByTestId('student-row').first().locator('a').click();
    await expect(page.getByTestId('student-lesson-row')).toContainText('فتح 2 من 2 أقسام');
    expect(net.external).toEqual([]);
    expect(net.failed).toEqual([]);
    expect(net3.external).toEqual([]);
    expect(errors).toEqual([]);
    await ctx3.close();
  });
});

/* ───────── plan acceptance test for phase 4, through the UI ───────── */

test.describe('Phase 4 — acceptance from the plan', () => {
  test('10 different attempts through the interface give numbers that match a hand calculation', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-1440', 'One screen size is enough: the numbers do not depend on the layout (UI flows are covered on every size above).');
    test.setTimeout(420_000);
    await disableSplash(page);
    await lessonWithObjectives(page);
    await newQuiz(page, 'اختبار القبول');
    let c = await addQuestion(page, 'mcq'); // Q1: 2 pts, one answer, objective 1 (التذكر)
    await common(c, { prompt: 'مصدر متجدد؟', points: '2', feedbackBad: 'الشمس.', objectives: [0] });
    await mcq(c, ['الشمس', 'الفحم'], [0]);
    c = await addQuestion(page, 'truefalse'); // Q2: 1 pt, objective 1, tagged الفهم
    await common(c, { prompt: 'الشمس مصدر متجدد.', points: '1', feedbackBad: 'راجع.', objectives: [0] });
    await c.getByTestId('tf-true').click();
    await c.getByTestId('q-bloom').selectOption('2');
    c = await addQuestion(page, 'mcq'); // Q3: 4 pts, answers {الرياح, الشمس}, partial, objective 2 (التحليل)
    await common(c, { prompt: 'اختر المتجدد', points: '4', feedbackBad: 'الرياح والشمس.', objectives: [1] });
    await mcq(c, ['الرياح', 'الفحم', 'الشمس', 'النفط'], [0, 2], true);
    c = await addQuestion(page, 'short'); // Q4: 3 pts, objective 2
    await common(c, { prompt: 'أقرب نجم إلى الأرض؟', points: '3', feedbackOk: 'أحسنت.', objectives: [1] });
    await c.getByTestId('short-accepted').first().fill('الشمس');
    await waitSaved(page);

    type Row = [string, boolean, boolean, string[], string, string];
    //            student  Q1     Q2     Q3                         Q4        expected score
    const plan: Row[] = [
      ['سارة', true, true, ['الرياح', 'الشمس'], 'الشمس', '10 / 10'],
      ['خالد', false, true, ['الرياح'], 'القمر', '3 / 10'],
      ['خالد', true, true, ['الرياح', 'الشمس', 'الفحم'], 'الشمس', '8 / 10'],
      ['ليلى', true, false, ['الرياح', 'الفحم'], 'شمس', '5 / 10'],
      ['عمر', true, true, ['الشمس'], '', '5 / 10'],
      ['نور', false, false, [], 'الشمس', '3 / 10'],
      ['يوسف', true, true, ['الرياح', 'الشمس'], 'القمر', '7 / 10'],
      ['ليلى', true, true, ['الرياح', 'الشمس'], 'الشمس', '10 / 10'],
      ['هند', false, true, ['الرياح'], 'الشمس', '6 / 10'],
      ['خالد', false, false, ['الرياح', 'الفحم'], 'القمر', '0 / 10'],
    ];
    for (const [name, q1, q2, q3, q4, expected] of plan) {
      await chooseStudent(page, name);
      await quizRow(page, 'اختبار القبول').getByTestId('student-quiz-go').click();
      await page.getByTestId('take-start').click();
      await current(page).getByRole('radio', { name: q1 ? 'الشمس' : 'الفحم' }).check();
      await page.getByTestId('take-next').click();
      await page.getByTestId(q2 ? 'take-true' : 'take-false').check();
      await page.getByTestId('take-next').click();
      for (const o of q3) await current(page).getByRole('checkbox', { name: o }).check();
      await page.getByTestId('take-next').click();
      if (q4) await page.getByTestId('take-short').fill(q4);
      await page.getByTestId('take-to-review').click();
      await page.getByTestId('take-submit').click();
      if (!q4 || q3.length === 0) await page.getByTestId('confirm-submit').getByRole('button', { name: 'تسليم الآن' }).click();
      await expect(page.getByTestId('result-score'), name).toHaveText(expected);
    }

    await page.goto('./#/results');
    await page.getByTestId('results-row').filter({ hasText: 'اختبار القبول' }).click();
    // attempt percents 100,30,80,50,50,30,70,100,60,0 → average 57 ; 5 of 10 passed (≥ 60 %)
    await expect(page.getByTestId('sum-attempts')).toHaveText('10');
    await expect(page.getByTestId('quiz-summary')).toContainText('محاولة · 7 طالب');
    await expect(page.getByTestId('sum-average')).toHaveText('57٪');
    await expect(page.getByTestId('sum-pass')).toHaveText('50٪');
    await expect(page.getByTestId('sum-best')).toHaveText('100٪');
    await expect(page.getByTestId('quiz-summary')).toContainText('الأدنى 0٪');
    // per question (ordered hardest first): Q3 50 %, Q1 60 %, Q4 60 %, Q2 70 %
    await expect(page.getByTestId('question-stat').locator('.obj-bars-n')).toHaveText(['50٪', '60٪', '60٪', '70٪']);
    await expect(page.getByTestId('question-stat').first()).toContainText('صحيحة 3 · جزئية 4 · خاطئة 2 · بلا إجابة 1');
    // per objective: O2 = 38/70 = 54.3 % ; O1 = 19/30 = 63.3 %
    await expect(page.getByTestId('objective-stat').locator('.obj-bars-n')).toHaveText(['54.3٪', '63.3٪']);
    // per Bloom level: التذكر 12/20 · الفهم 7/10 · التحليل 38/70
    const bloom = page.getByTestId('bloom-stats');
    await expect(bloom.locator('[data-level="1"]')).toContainText('12 من 20 درجة');
    await expect(bloom.locator('[data-level="2"]')).toContainText('7 من 10 درجة');
    await expect(bloom.locator('[data-level="4"]')).toContainText('38 من 70 درجة');
    // per student, best attempt: خالد 80 (of 30, 80, 0), ليلى 100 (of 50, 100)
    await expect(page.getByTestId('quiz-student-row')).toHaveCount(7);
    await expect(page.getByTestId('quiz-student-row').filter({ hasText: 'خالد' }).getByTestId('quiz-student-counted')).toHaveText('8/10 · 80٪');
    await expect(page.getByTestId('quiz-student-row').filter({ hasText: 'ليلى' }).getByTestId('quiz-student-counted')).toHaveText('10/10 · 100٪');
    await page.screenshot({ path: `docs/screenshots/${info.project.name}/p4-acceptance-10.png`, fullPage: true });
    // "last" policy changes only which attempt counts, never the saved attempts
    await page.goto('./#/quizzes');
    await page.getByRole('link', { name: 'فتح الاختبار: اختبار القبول' }).click();
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('set-score-policy').selectOption('last');
    await waitSaved(page);
    await page.goto('./#/results');
    const khalid = page.getByTestId('student-row').filter({ hasText: 'خالد' });
    await expect(khalid).toContainText('3 محاولة');
    await expect(khalid.getByTestId('student-average')).toHaveText('المتوسط 0٪');
    await page.getByTestId('results-row').filter({ hasText: 'اختبار القبول' }).click();
    await expect(page.getByTestId('sum-attempts')).toHaveText('10');
  });
});
