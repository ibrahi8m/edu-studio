import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { settleAfterAdd } from './helpers';
import { addQuestion, chooseStudent, common, disableSplash, isPhone, lessonWithObjectives, newQuiz, quizRow, waitSaved } from './quiz-helpers';

/** 1.1.0: content kinds, learner environment, «صفحتي», AI Design Studio, renamed labels — through the real UI. */

const heavy = (name: string) => ['desktop-1440', 'phone-pixel-7'].includes(name);

async function fits(page: Page, label: string) {
  const vw = page.viewportSize()!.width;
  const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollW, `horizontal overflow: ${label}`).toBeLessThanOrEqual(vw);
  expect(innerW, `zoomed out: ${label}`).toBe(vw);
}

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);

async function addBlock(page: Page, type: string): Promise<Locator> {
  await page.getByTestId('add-block').last().click();
  await page.getByTestId(`add-${type}`).click();
  await expect(page.getByTestId('add-block-dialog')).toBeHidden();
  await settleAfterAdd(page);
  return page.getByTestId('block').last();
}

/* ───────── identity, About, profile, labels ───────── */

test('About shows exactly the fixed project information; the greeting uses the profile name, never a built-in one; labels renamed', async ({ page }) => {
  await disableSplash(page);
  await page.goto('./#/about');
  await expect(page.getByTestId('about-name')).toHaveText('إبراهيم سمير الخطيب');
  await expect(page.locator('.about-kicker')).toHaveText('صاحب المشروع ومصممه');
  await expect(page.locator('.about-brand')).toHaveAttribute('aria-label', 'IBRAHI8M EDU STUDIO');
  const rows = page.getByTestId('about-info').locator('.kv-row');
  await expect(rows).toHaveCount(4);
  await expect(rows.locator('dt')).toHaveText(['البرنامج الأكاديمي', 'المساق', 'الجامعة', 'أستاذ المساق']);
  await expect(rows.locator('dd')).toHaveText(['ماجستير المناهج وطرق التدريس', 'تصميم المحتوى الرقمي', 'الجامعة الإسلامية – كلية التربية', 'أ.د. مجدي عقل']);

  // No built-in user name: the dashboard greets without a name until the user writes it in «صفحتي».
  await page.goto('./');
  await expect(page.getByTestId('hero-title')).not.toContainText('إبراهيم');
  await expect(page.getByTestId('hero-add-name')).toBeVisible();
  await page.goto('./#/me');
  await page.getByTestId('profile-userName').fill('سارة أحمد');
  await page.getByTestId('profile-userRole').fill('معلمة علوم');
  await page.getByTestId('profile-userRole').blur();
  await expect(page.getByText('تم الحفظ').first()).toBeVisible();
  await page.goto('./');
  await expect(page.getByTestId('hero-title')).toContainText('سارة أحمد');
  if (!isPhone(test.info().project.name) && test.info().project.name !== 'tablet-ipad-mini') {
    await expect(page.getByTestId('user-card-name')).toHaveText('سارة أحمد');
  }

  // Renamed labels
  await page.goto('./#/projects');
  await expect(page.locator('.page-title, h1').first()).toHaveText('المحتوى التعليمي');
  await expect(page.getByTestId('new-project')).toContainText('إضافة محتوى تعليمي جديد');
  await page.getByTestId('new-project').click();
  await expect(page.getByTestId('project-dialog').locator('.dialog-title, h2').first()).toHaveText('إضافة محتوى تعليمي جديد');
  await page.getByTestId('project-dialog').getByRole('button', { name: 'إلغاء' }).click();
  await page.goto('./#/more');
  await expect(page.getByTestId('page-more')).toContainText('المحتوى التعليمي');
  await expect(page.getByTestId('page-more')).toContainText('بيئة المتعلم');
  await expect(page.getByTestId('page-more')).toContainText('IBRAHI8M AI Design Studio');
  await expect(page.getByTestId('page-more')).toContainText('صفحتي');
  await chooseStudent(page, 'زائر');
  await expect(page.getByTestId('student-shell')).toContainText('بيئة المتعلم');
  for (const r of ['', 'projects', 'learn', 'results', 'about', 'me', 'ai-studio', 'more']) {
    await page.goto(`./#/${r}`);
    await expect(page.locator('.page, .take-wrap').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('وضع الطالب');
    await expect(page.locator('body')).not.toContainText('المشاريع والدروس');
  }
});

/* ───────── content kinds ───────── */

test('content kinds: university content with its own fields, units, draft → hidden from learners → published → visible; filter by kind', async ({ page }, info) => {
  test.skip(!heavy(info.project.name), 'one computer and one phone size');
  await disableSplash(page);
  await page.goto('./#/projects');
  await page.getByTestId('new-project').click();
  const d = page.getByTestId('project-dialog');
  await d.getByTestId('content-kind-university').click();
  await expect(d.getByTestId('project-grade')).toHaveCount(0); // no school grade for university content
  await d.getByTestId('project-title').fill('تصميم المحتوى الرقمي');
  await d.getByTestId('project-subject').fill('تصميم المحتوى الرقمي');
  await d.getByTestId('detail-specialization').fill('المناهج وطرق التدريس');
  await d.getByTestId('detail-degree').selectOption('ماجستير');
  await d.getByTestId('detail-level').fill('الفصل الأول');
  await d.getByTestId('detail-objectives').fill('يصمم محتوى رقميًا\nيقوّم محتوى رقميًا');
  await d.getByTestId('detail-references').fill('مرجع أول\nمرجع ثانٍ');
  await d.getByTestId('project-published').uncheck();
  await d.getByTestId('project-save').click();
  await expect(page.getByTestId('project-heading')).toHaveText('تصميم المحتوى الرقمي');
  await expect(page.getByTestId('publish-state')).toHaveText('غير منشور');
  await expect(page.getByTestId('project-details')).toContainText('ماجستير');
  await expect(page.getByTestId('project-details')).toContainText('مرجع ثانٍ');
  await expect(page.locator('.lessons-head .card-title').first()).toContainText('الموضوعات والمحاضرات');

  for (const [t, u] of [
    ['مقدمة في التصميم', 'الموضوع الأول'],
    ['مبادئ الوسائط', 'الموضوع الأول'],
    ['التقويم', 'الموضوع الثاني'],
  ]) {
    await page.getByTestId('new-lesson').first().click();
    // Like a person: type once the dialog has opened and put the cursor in the title (typing within
    // ~10 ms of the click could be lost on the first opening; see TEST-REPORT 1.1.0, known issues).
    await expect(page.getByTestId('lesson-title')).toBeFocused();
    await page.getByTestId('lesson-unit').fill(u);
    await page.getByTestId('lesson-title').fill(t);
    await page.getByTestId('lesson-save').click();
    await expect(page.getByTestId('lesson-dialog')).toBeHidden();
  }
  await expect(page.getByTestId('unit-head')).toHaveText(['الموضوع الأول', 'الموضوع الثاني']);
  const projectUrl = page.url();

  // A university learner sees nothing while it is a draft…
  await page.goto('./#/learn');
  await page.getByTestId('learn-name').fill('سارة');
  await page.getByTestId('learn-type-university').click();
  await page.getByTestId('learn-continue').click();
  await expect(page.getByTestId('learner-type')).toHaveText('طالب جامعي');
  await expect(page.getByTestId('learn-empty')).toBeVisible();

  // …and sees it once published, grouped by topic, with its objectives.
  await page.goto(projectUrl);
  await page.getByTestId('toggle-publish').click();
  await expect(page.getByTestId('publish-state')).toHaveText('منشور');
  await page.goto('./#/learn');
  await expect(page.getByTestId('learn-project')).toHaveCount(1);
  await expect(page.getByTestId('learn-project')).toContainText('تصميم المحتوى الرقمي');
  await expect(page.getByTestId('learn-unit')).toHaveText(['الموضوع الأول', 'الموضوع الثاني']);
  await page.getByTestId('learn-about').locator('summary').click();
  await expect(page.getByTestId('learn-about')).toContainText('يقوّم محتوى رقميًا');
  await fits(page, 'learner home (university)');

  // A school learner does not see university content.
  await page.getByTestId('switch-student').click();
  await page.getByTestId('learn-name').fill('علي');
  await page.getByTestId('learn-continue').click();
  await expect(page.getByTestId('learner-type')).toHaveText('طالب مدرسة');
  await expect(page.getByTestId('learn-empty')).toBeVisible();

  // Filter by kind on the content list
  await page.goto('./#/projects?kind=training');
  await expect(page.getByTestId('no-results')).toBeVisible();
  await page.goto('./#/projects?kind=university');
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  await expect(page.getByTestId('project-card')).toContainText('جامعي');

  // Data survives a reload (persistent).
  await page.reload();
  await expect(page.getByTestId('project-card')).toHaveCount(1);
});

/* ───────── learner environment: assignment, grading, remedial / enrichment, progress ───────── */

test('learner environment: assignment draft (local) vs submit, attachment checks, teacher grading, rule-based remedial then enrichment, real progress', async ({ page }, info) => {
  test.skip(!heavy(info.project.name), 'one computer and one phone size');
  test.setTimeout(240_000);
  await disableSplash(page);
  await lessonWithObjectives(page);
  await page.getByTestId('tab-content').click();
  let b = await addBlock(page, 'heading');
  await b.getByTestId('heading-text').fill('التكليف');
  b = await addBlock(page, 'activity');
  await b.getByTestId('activity-title').fill('بحث عن مصدر طاقة');
  await b.getByTestId('activity-steps').fill('اختر مصدرًا\nاكتب فقرة');
  await b.getByTestId('activity-submit').check();
  b = await addBlock(page, 'activity');
  await b.getByTestId('activity-title').fill('نشاط علاجي للطاقة');
  await b.getByTestId('activity-steps').fill('راجع البطاقات');
  await b.getByTestId('activity-track-remedial').click();
  b = await addBlock(page, 'activity');
  await b.getByTestId('activity-title').fill('نشاط إثرائي للطاقة');
  await b.getByTestId('activity-steps').fill('صمّم ملصقًا');
  await b.getByTestId('activity-track-enrichment').click();
  await waitSaved(page);

  await newQuiz(page, 'اختبار قصير');
  const c = await addQuestion(page, 'truefalse');
  await common(c, { prompt: 'الشمس مصدر متجدد.', points: '1', feedbackBad: 'الشمس لا تنفد.', objectives: [0] });
  await c.getByTestId('tf-true').click();
  await waitSaved(page);

  // ── learner ──
  await chooseStudent(page, 'منى');
  await expect(page.getByTestId('dash-completion')).toHaveText('0٪');
  await expect(page.getByTestId('dash-remaining')).toHaveText('1');
  await expect(page.getByTestId('lesson-assignment')).toContainText('لم يبدأ');
  await page.getByTestId('open-lesson').first().click();
  const lessonUrl = page.url().split('?')[0];
  await page.getByTestId('lp-next').click();
  const panel = page.getByTestId('assignment');
  await expect(panel).toHaveAttribute('data-state', 'not_started');
  // Remedial/enrichment activities are not part of the normal sections.
  await expect(page.getByText('نشاط علاجي للطاقة')).toHaveCount(0);

  await panel.getByTestId('assign-answer').fill('الطاقة الشمسية متجددة لأنها لا تنفد.');
  await panel.getByTestId('assign-save-draft').click();
  await expect(page.getByTestId('toast').last()).toContainText('لم تُسلَّم');
  await expect(panel).toHaveAttribute('data-state', 'draft');
  await expect(panel.getByTestId('assign-state')).toHaveText('مسودة');

  // Attachments: a disallowed type is refused with a message; an allowed one is kept.
  await panel.getByTestId('assign-file').setInputFiles({ name: 'برنامج.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
  await expect(page.getByTestId('toast').last()).toContainText('غير مسموح');
  await panel.getByTestId('assign-file').setInputFiles({ name: 'حل.txt', mimeType: 'text/plain', buffer: Buffer.from('إجابتي المرفقة') });
  await expect(panel.getByTestId('assign-files')).toContainText('حل.txt');
  await panel.getByTestId('assign-submit').click();
  await page.getByTestId('assign-confirm').getByRole('button', { name: 'تسليم' }).click();
  await expect(panel).toHaveAttribute('data-state', 'submitted');
  await expect(panel.getByTestId('assign-state')).toHaveText('تم التسليم');
  await expect(panel.getByTestId('assign-withdraw')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('assignment')).toHaveAttribute('data-state', 'submitted');
  await expect(page.getByTestId('assign-answer-read')).toContainText('لا تنفد');
  await fits(page, 'lesson with assignment');

  // End of the lesson: no attempt yet → only a message.
  await page.goto(`${lessonUrl}?s=end`);
  await expect(page.getByTestId('lp-recommend')).toHaveAttribute('data-kind', 'none');

  // Wrong answer → 0 % (< 60 %) → remedial activity.
  await quizRow(page, 'اختبار قصير').getByTestId('student-quiz-go').click();
  await page.getByTestId('take-start').click();
  await page.getByTestId('take-false').check();
  await page.getByTestId('take-to-review').click();
  await page.getByTestId('take-submit').click();
  await expect(page.getByTestId('result-percent')).toHaveText('0٪');
  await page.goto(`${lessonUrl}?s=end`);
  await expect(page.getByTestId('lp-recommend')).toHaveAttribute('data-kind', 'remedial');
  await expect(page.getByTestId('lp-recommend')).toContainText('نشاط علاجي للطاقة');
  await expect(page.getByTestId('lp-recommend')).not.toContainText('نشاط إثرائي للطاقة');
  await expect(page.getByTestId('lp-recommend')).toContainText('ليست ذكاءً اصطناعيًا');

  // Right answer → 100 % → enrichment.
  await quizRow(page, 'اختبار قصير').getByTestId('student-quiz-go').click();
  await page.getByTestId('take-start').click();
  await page.getByTestId('take-true').check();
  await page.getByTestId('take-to-review').click();
  await page.getByTestId('take-submit').click();
  await expect(page.getByTestId('result-percent')).toHaveText('100٪');
  await page.goto(`${lessonUrl}?s=end`);
  await expect(page.getByTestId('lp-recommend')).toHaveAttribute('data-kind', 'enrichment');
  await expect(page.getByTestId('lp-recommend')).toContainText('نشاط إثرائي للطاقة');

  // ── teacher grades on the same device ──
  await page.goto('./#/results');
  const subs = page.getByTestId('results-submissions');
  await expect(subs.getByTestId('submission-row')).toHaveCount(1);
  await subs.getByTestId('submission-open').click();
  const g = page.getByTestId('grade-dialog');
  await expect(g.getByTestId('grade-answer')).toContainText('لا تنفد');
  await expect(g.getByTestId('assign-files')).toContainText('حل.txt');
  await g.getByTestId('grade-score').fill('150');
  await g.getByTestId('grade-save').click();
  await expect(g.getByRole('alert')).toContainText('بين 0 و100');
  await g.getByTestId('grade-score').fill('90');
  await g.getByTestId('grade-feedback').fill('بحث جيد، أضف مصدرًا.');
  await g.getByTestId('grade-save').click();
  await expect(subs.getByTestId('submission-row')).toContainText('90/100');

  // ── learner sees the evaluation and real progress ──
  await chooseStudent(page, 'منى');
  await expect(page.getByTestId('lesson-assignment')).toContainText('تم التقييم');
  await expect(page.getByTestId('dash-quizzes')).toHaveText('1/1');
  await expect(page.getByTestId('dash-attempts')).toContainText('2');
  await expect(page.getByTestId('dash-resume')).toContainText('مصادر الطاقة');
  await expect(page.getByTestId('dash-results')).toContainText('100٪');
  await page.getByTestId('dash-resume-link').click();
  await expect(page.getByTestId('lp-part')).toHaveAttribute('data-section', 'end'); // resumes where the learner stopped
  await page.getByTestId('lp-prev').click();
  await expect(page.getByTestId('assign-grade')).toContainText('90 من 100');
  await expect(page.getByTestId('assign-grade')).toContainText('أضف مصدرًا');
  await expect(page.getByTestId('assign-withdraw')).toHaveCount(0); // graded: locked
});

test('trainee teacher profile: own fields, assigned programs only', async ({ page }, info) => {
  test.skip(!heavy(info.project.name), 'one computer and one phone size');
  await disableSplash(page);
  for (const title of ['التعلم النشط', 'التقويم البديل']) {
    await page.goto('./#/projects');
    await page.getByTestId('new-project').click();
    const d = page.getByTestId('project-dialog');
    await d.getByTestId('content-kind-training').click();
    await d.getByTestId('project-title').fill(title);
    await d.getByTestId('detail-targetTeachers').fill('معلمو المرحلة الأساسية');
    await d.getByTestId('detail-duration').fill('3 أيام');
    await d.getByTestId('project-save').click();
    await expect(page.getByTestId('project-heading')).toHaveText(title);
    await page.getByTestId('new-lesson').first().click();
    // Like a person: type once the dialog has opened and put the cursor in the title (typing within
    // ~10 ms of the click could be lost on the first opening; see TEST-REPORT 1.1.0, known issues).
    await expect(page.getByTestId('lesson-title')).toBeFocused();
    await page.getByTestId('lesson-unit').fill('المحور الأول');
    await page.getByTestId('lesson-title').fill(`جلسة: ${title}`);
    await page.getByTestId('lesson-save').click();
    await expect(page.getByTestId('lesson-dialog')).toBeHidden();
  }
  await page.goto('./#/learn');
  await page.getByTestId('learn-name').fill('أ. خالد');
  await page.getByTestId('learn-type-trainee').click();
  await page.getByTestId('learn-continue').click();
  await expect(page.getByTestId('learn-project')).toHaveCount(2);
  await page.getByTestId('learner-profile-edit').click();
  const d = page.getByTestId('learner-profile-dialog');
  await expect(d.getByTestId('profile-grade')).toHaveCount(0); // a school grade is not asked of a trainee
  await d.getByTestId('profile-learner-id').fill('TR-17');
  await d.getByTestId('profile-specialization').fill('العلوم');
  await d.getByTestId('profile-level').fill('5 سنوات');
  await d.getByText('التعلم النشط').click();
  await d.getByTestId('learner-profile-save').click();
  await expect(page.getByTestId('learner-profile')).toContainText('TR-17');
  await expect(page.getByTestId('learner-profile')).toContainText('5 سنوات');
  await expect(page.getByTestId('learn-project')).toHaveCount(1);
  await expect(page.getByTestId('learn-project')).toContainText('التعلم النشط');
  await page.reload();
  await expect(page.getByTestId('learner-type')).toHaveText('معلم متدرب');
  await expect(page.getByTestId('learn-project')).toHaveCount(1);
  await fits(page, 'trainee home');
});

/* ───────── «صفحتي»: CV ───────── */

test('«صفحتي»: the CV shows the given data exactly, edits persist, prints alone, resets to the original', async ({ page }) => {
  await disableSplash(page);
  await page.goto('./#/me');
  const cv = page.getByTestId('cv-sheet');
  await expect(page.getByTestId('cv-name')).toHaveText('إبراهيم سمير محمود الخطيب');
  await expect(cv).toContainText('إعلامي | مصمم وسائط متعددة | صانع محتوى رقمي | منسق مشاريع');
  await expect(cv).toContainText('خان يونس – قطاع غزة، فلسطين');
  await expect(cv).toContainText('2002');
  await expect(cv.locator('.cv-contact dd')).toContainText(['خان يونس – قطاع غزة، فلسطين', '2002', 'غير محدد حاليًا', 'غير محدد حاليًا']);
  await expect(page.getByTestId('cv-education').locator('li')).toHaveText(['ماجستير المناهج وطرق التدريس – الجامعة الإسلامية، كلية التربية', 'بكالوريوس الوسائط المتعددة – الكلية الجامعية للعلوم والتكنولوجيا']);
  await expect(page.getByTestId('cv-experience').locator('li')).toHaveText(['إعلامي – جمعية واحة الأمل', 'إعلامي – مؤسسة سنابل', 'مصمم وسائط متعددة وصانع محتوى رقمي – عمل حر']);
  await expect(page.getByTestId('cv-techSkills').locator('li')).toHaveCount(6);
  await expect(page.getByTestId('cv-proSkills').locator('li')).toHaveCount(8);
  await expect(page.getByTestId('cv-courses')).toContainText('Golden House');
  await expect(page.getByTestId('cv-languages')).toContainText('العربية: اللغة الأم');
  await expect(cv).toContainText('متاحة عند الطلب');
  await fits(page, 'CV view');

  // Edit: the English level is the user's to set.
  await page.getByTestId('cv-edit').click();
  await page.getByTestId('cv-lang-level').nth(1).fill('جيد جدًا');
  await page.getByTestId('cv-in-phone').fill('0599 000 000');
  await fits(page, 'CV editor');
  await page.getByTestId('cv-save').click();
  await page.reload();
  await expect(page.getByTestId('cv-languages')).toContainText('الإنجليزية: جيد جدًا');
  await expect(page.getByTestId('cv-sheet')).toContainText('0599 000 000');

  // Print / PDF: the browser's print dialog is called, and in print only the CV is shown.
  await page.evaluate(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => void (window as unknown as { __printed: number }).__printed++;
  });
  await page.getByTestId('cv-print').click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('cv-sheet')).toBeVisible();
  await expect(page.getByTestId('profile-card')).toBeHidden();
  await expect(page.getByTestId('cv-edit')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });

  await page.getByTestId('cv-reset').click();
  await page.getByTestId('confirm-cv-reset').getByRole('button', { name: 'نعم، أعِدها' }).click();
  await expect(page.getByTestId('cv-sheet')).not.toContainText('0599 000 000');
  await expect(page.getByTestId('cv-sheet').locator('.cv-contact dd').nth(2)).toHaveText('غير محدد حاليًا');
});

/* ───────── AI Design Studio ───────── */

test('AI Design Studio: local prompt from an Arabic idea, honest notes, ratio, brand identity, copy, .txt, library CRUD that persists', async ({ page, context }, info) => {
  test.skip(!heavy(info.project.name), 'one computer and one phone size');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await disableSplash(page);
  const net: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) net.push(r.url());
  });
  await page.goto('./#/ai-studio');
  await expect(page.getByTestId('ai-honest')).toContainText('لا يولّد صورًا');

  // Empty idea → a clear message, nothing generated.
  await page.getByTestId('ai-generate').click();
  await expect(page.getByTestId('ai-form').getByRole('alert')).toContainText('اكتب فكرة التصميم');

  await page.getByTestId('ai-idea').fill('طالب يقرأ كتاب في حديقة المدرسة مع زرافة');
  await page.getByTestId('ai-type').selectOption('educational');
  await page.getByTestId('ai-ratio-16:9').click();
  // 1.2.0: style, placements, mode and identity live under «إعدادات متقدمة» (closed by default)
  await expect(page.getByTestId('ai-style')).toBeHidden();
  await page.getByTestId('ai-advanced-toggle').click();
  await page.getByTestId('ai-style').selectOption('flat');
  await page.getByTestId('ai-texts').fill('اقرأ كل يوم');
  await page.getByTestId('ai-text-place').selectOption('top');
  await page.getByTestId('ai-logo-place').selectOption('bottom-left');
  await page.getByTestId('ai-generate').click();
  const prompt = page.getByTestId('ai-prompt');
  await expect(prompt).toHaveValue(/^An educational illustration for learners about student reading book/);
  await expect(prompt).toHaveValue(/wide 16:9 aspect ratio/);
  await expect(prompt).toHaveValue(/"اقرأ كل يوم" placed at the top/);
  await expect(page.getByTestId('ai-warnings')).toContainText('زرافة'); // untranslated word is reported
  await expect(page.getByTestId('ai-logo-rules')).toContainText('Do not redraw it in another style'); // 1.4.0 wording
  await expect(page.getByTestId('ai-negative')).toContainText('invented logos');
  await expect(page.getByTestId('ai-explanation')).toContainText('لا يولّد صورًا');
  await fits(page, 'AI studio result');

  // Copy
  await page.getByTestId('ai-copy').click();
  await expect(page.getByTestId('toast').last()).toContainText('نُسخ');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await prompt.inputValue());

  // Regenerate changes the wording, same facts
  const before = await prompt.inputValue();
  await page.getByTestId('ai-regenerate').click();
  await expect(prompt).not.toHaveValue(before);
  await expect(prompt).toHaveValue(/16:9/);

  // Download .txt
  const dl = page.waitForEvent('download');
  await page.getByTestId('ai-download').click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/\.txt$/);
  const txt = readFileSync((await file.path())!, 'utf8');
  expect(txt).toContain('PROMPT (EN):');
  expect(txt).toContain('NEGATIVE PROMPT:');

  // Edit and save to the library
  await prompt.fill(`${before} Extra soft shadows.`);
  await page.getByTestId('ai-title').fill('ملصق القراءة');
  await page.getByTestId('ai-save').click();
  await expect(page.getByTestId('toast').last()).toContainText('حُفظ «ملصق القراءة»');

  // Brand mode applies the saved identity and flags the other one
  await page.getByTestId('ai-mode-brand').click();
  await page.getByTestId('ai-brand').selectOption('brand-edu-studio');
  await page.getByTestId('ai-idea').fill('إعلان عن IBRAHIM AI UNIVERSE');
  await page.getByTestId('ai-generate').click();
  await expect(prompt).toHaveValue(/#2F7BFF/);
  await expect(page.getByTestId('ai-warnings')).toContainText('هوية أخرى');

  // Library: persists after reload, search, open, duplicate, delete with confirmation
  await page.reload();
  await page.getByTestId('ai-tab-library').click();
  await expect(page.getByTestId('ai-lib-item')).toHaveCount(1);
  await page.getByTestId('ai-lib-search').fill('Extra soft shadows'); // the edited prompt is saved and searchable
  await expect(page.getByTestId('ai-lib-item')).toHaveCount(1);
  await page.getByTestId('ai-lib-search').fill('غير موجود');
  await expect(page.getByTestId('ai-lib-item')).toHaveCount(0);
  await page.getByTestId('ai-lib-search').fill('القراءة');
  await expect(page.getByTestId('ai-lib-item')).toHaveCount(1);
  await page.getByTestId('ai-lib-duplicate').click();
  await page.getByTestId('ai-lib-search').fill('');
  await expect(page.getByTestId('ai-lib-item')).toHaveCount(2);
  await page.getByTestId('ai-lib-type').selectOption('poster');
  await expect(page.getByTestId('ai-lib-item')).toHaveCount(0);
  await page.getByTestId('ai-lib-type').selectOption('');
  await page.getByTestId('ai-lib-delete').first().click();
  await page.getByTestId('confirm-ai-delete').getByRole('button', { name: 'حذف' }).click();
  await expect(page.getByTestId('ai-lib-item')).toHaveCount(1);
  await page.getByTestId('ai-lib-open').click();
  await expect(page.getByTestId('ai-editing')).toBeVisible();
  await expect(page.getByTestId('ai-prompt')).toHaveValue(/Extra soft shadows\./);

  // Identities: the universe brand has no colours until its owner sets them
  await page.getByTestId('ai-tab-brands').click();
  await expect(page.getByTestId('ai-brand-item')).toHaveCount(2);
  await expect(page.getByTestId('ai-brand-item').nth(1)).toContainText('no colours defined yet');
  await page.getByTestId('ai-brand-edit').nth(1).click();
  await page.getByTestId('ai-brand-colors').fill('deep violet, cyan');
  await page.getByTestId('ai-brand-save').click();
  await expect(page.getByTestId('ai-brand-item').nth(1)).toContainText('deep violet, cyan');
  await fits(page, 'AI studio identities');

  expect(net, 'the studio made no network request').toEqual([]);
});

/* ───────── phones: new screens fit, are reachable and accessible ───────── */

test('new screens fit every size without horizontal scrolling and have no serious accessibility violations', async ({ page }) => {
  await disableSplash(page);
  for (const r of ['me', 'ai-studio', 'ai-studio?tab=library', 'ai-studio?tab=brands', 'about', 'projects', 'learn']) {
    await page.goto(`./#/${r}`);
    await expect(page.locator('.page, .take-wrap').first()).toBeVisible();
    await fits(page, r);
    expect(await serious(page), r).toEqual([]);
  }
  await page.goto('./#/projects');
  await page.getByTestId('new-project').click();
  for (const k of ['school', 'university', 'training']) {
    await page.getByTestId(`content-kind-${k}`).click();
    await fits(page, `content dialog ${k}`);
  }
  expect(await serious(page), 'content dialog').toEqual([]);
  // touch targets of the main new controls
  const small: string[] = [];
  for (const id of ['content-kind-school', 'content-kind-university', 'project-save']) {
    const box = await page.getByTestId(id).boundingBox();
    if (box && box.height < 40) small.push(`${id}: ${box.height}`);
  }
  expect(small).toEqual([]);
});
