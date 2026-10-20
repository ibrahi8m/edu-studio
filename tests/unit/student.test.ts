import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { EduDB } from '../../src/db/db';
import { saveLessonEditor } from '../../src/db/lessonDocs';
import { completeLesson, getProgress, LessonNotFinishedError, markCardSeen, toggleActivityStep, visitSection } from '../../src/db/progress';
import { createLesson, createProject, deleteLesson, deleteProject, restoreLesson, restoreProject } from '../../src/db/projects';
import { checkAnswer, CheckNotAllowedError, createQuiz, loadQuiz, saveProgress, saveQuiz, startAttempt, submitAttempt } from '../../src/db/quizzes';
import { emptyDoc, newBlock, newObjective } from '../../src/lesson/model';
import type { ActivityBlock, CardsBlock, HeadingBlock, TextBlock } from '../../src/lesson/types';
import { bloomStats, countedAttempt, objectiveStats, questionStats, quizSummary, studentQuizRows, studentSummaries } from '../../src/quiz/analytics';
import { bloomDistribution, newQuestion, normalizeQuiz, questionBloom } from '../../src/quiz/model';
import type { Answer, Attempt, McqQuestion, Question, ShortQuestion, TrueFalseQuestion } from '../../src/quiz/types';
import { lessonSections, summarizeProgress } from '../../src/student/sections';

const fresh = () => new EduDB(`s-${Math.random()}`);

/* ───────── lesson parts and progress ───────── */

function lessonDoc(lessonId: string) {
  const doc = emptyDoc(lessonId);
  const intro = newBlock('text') as TextBlock;
  intro.text = 'مقدمة قبل أي عنوان.';
  const h1 = newBlock('heading') as HeadingBlock;
  h1.text = 'الطاقة المتجددة';
  h1.level = 2;
  const t1 = newBlock('text') as TextBlock;
  t1.text = 'الشمس والرياح.';
  const sub = newBlock('heading') as HeadingBlock;
  sub.text = 'عنوان فرعي';
  sub.level = 3;
  const cards = newBlock('cards') as CardsBlock;
  cards.cards = [
    { id: 'c1', front: 'شمس', back: 'متجددة' },
    { id: 'c2', front: 'فحم', back: 'غير متجدد' },
  ];
  const h2 = newBlock('heading') as HeadingBlock;
  h2.text = 'نشاط';
  h2.level = 2;
  const act = newBlock('activity') as ActivityBlock;
  act.title = 'صنّف';
  act.steps = 'اقرأ\nصنّف\nناقش';
  const emptyHeading = newBlock('heading') as HeadingBlock; // no text: ignored
  emptyHeading.level = 2;
  doc.blocks = [intro, h1, t1, sub, cards, emptyHeading, h2, act];
  return { doc, ids: { intro, h1, h2, act, cards } };
}

describe('lesson parts for the student', () => {
  it('splits at main headings; content before the first heading is its own part; start and end are always there', () => {
    const { doc, ids } = lessonDoc('l');
    const s = lessonSections(doc);
    expect(s.map((x) => x.kind)).toEqual(['intro', 'content', 'content', 'content', 'end']);
    expect(s.map((x) => x.title)).toEqual(['البداية والأهداف', 'المحتوى', 'الطاقة المتجددة', 'نشاط', 'الختام والاختبارات']);
    expect(s[1].id).toBe(`s:${ids.intro.id}`);
    expect(s[2].blocks.map((b) => b.type)).toEqual(['text', 'heading', 'cards']); // H3 stays inside its part
    expect(s[3].blocks).toEqual([ids.act]);
    expect(lessonSections(emptyDoc('x')).map((x) => x.id)).toEqual(['intro', 'end']);
  });

  it('saves progress per student: parts opened, cards turned, activity steps; finishing needs every part', async () => {
    const d = fresh();
    const p = await createProject(d, { title: 'م' });
    const l = await createLesson(d, p.id, { title: 'درس' });
    const { doc, ids } = lessonDoc(l.id);
    await saveLessonEditor(d, l.id, doc, { title: l.title, summary: '', duration: 0, status: 'draft' }, 0);
    const parts = lessonSections(doc);

    await visitSection(d, 'سارة', l, 'intro', parts.length);
    await visitSection(d, 'سارة', l, parts[2].id, parts.length);
    await visitSection(d, 'سارة', l, parts[2].id, parts.length); // twice: counted once
    await markCardSeen(d, 'سارة', l, ids.cards.id, 'c1');
    await toggleActivityStep(d, 'سارة', l, ids.act.id, 0);
    await toggleActivityStep(d, 'سارة', l, ids.act.id, 2);
    await toggleActivityStep(d, 'سارة', l, ids.act.id, 2); // untick
    // Another student on the same device: separate row.
    await visitSection(d, 'خالد', l, 'intro', parts.length);

    const sara = await getProgress(d, 'سارة', l.id);
    expect(sara?.visited).toEqual(['intro', parts[2].id]);
    expect(sara?.current).toBe(parts[2].id);
    expect(summarizeProgress(doc, sara)).toMatchObject({ sections: 5, visited: 2, fraction: 0.4, activitySteps: 3, activityDone: 1, cards: 2, cardsSeen: 1, completed: false });
    expect(summarizeProgress(doc, await getProgress(d, 'خالد', l.id))).toMatchObject({ visited: 1, activityDone: 0, cardsSeen: 0 });
    // Name spelling variants map to the same student (same key as quiz attempts).
    expect((await getProgress(d, 'ساره', l.id))?.id).toBe(sara?.id);

    await expect(completeLesson(d, 'سارة', l, parts.map((x) => x.id))).rejects.toBeInstanceOf(LessonNotFinishedError);
    for (const x of parts) await visitSection(d, 'سارة', l, x.id, parts.length);
    const done = await completeLesson(d, 'سارة', l, parts.map((x) => x.id));
    expect(done.completedAt).toBeTypeOf('number');
    expect(summarizeProgress(doc, done).completed).toBe(true);

    // Progress survives closing the database.
    d.close();
    const again = new EduDB(d.name);
    expect((await getProgress(again, 'سارة', l.id))?.completedAt).toBe(done.completedAt);
  });

  it('deleting a lesson or project removes its progress, and undo restores it', async () => {
    const d = fresh();
    const p = await createProject(d, { title: 'م' });
    const l = await createLesson(d, p.id, { title: 'درس' });
    await visitSection(d, 'سارة', l, 'intro', 2);
    const snap = await deleteLesson(d, l.id);
    expect(await d.progress.count()).toBe(0);
    await restoreLesson(d, snap);
    expect(await d.progress.count()).toBe(1);
    const ps = await deleteProject(d, p.id);
    expect(await d.progress.count()).toBe(0);
    await restoreProject(d, ps);
    expect((await getProgress(d, 'سارة', l.id))?.visited).toEqual(['intro']);
  });
});

/* ───────── attempts: no duplicates, immediate feedback, retries ───────── */

function tf(answer: boolean, points = 1): TrueFalseQuestion {
  const q = newQuestion('truefalse') as TrueFalseQuestion;
  q.prompt = 'عبارة';
  q.answer = answer;
  q.points = points;
  q.feedbackIncorrect = 'راجع.';
  return q;
}

async function quizWith(questions: Question[], settings: Partial<ReturnType<typeof normalizeQuiz> extends infer Q ? Q extends { settings: infer S } ? S : never : never> = {}) {
  const d = fresh();
  const p = await createProject(d, { title: 'م' });
  const z = await createQuiz(d, p.id, null, 'اختبار');
  await saveQuiz(d, { ...z, questions, settings: { ...z.settings, ...settings } }, 0);
  return { d, quiz: (await loadQuiz(d, z.id))! };
}

describe('attempts', () => {
  it('reopening the page never opens a second attempt: the open one is returned', async () => {
    const { d, quiz } = await quizWith([tf(true)], { maxAttempts: 2 });
    const a = await startAttempt(d, quiz.id, 'سارة');
    const b = await startAttempt(d, quiz.id, 'سارة'); // e.g. page reopened, double click, second tab
    expect(b.id).toBe(a.id);
    expect(await d.attempts.count()).toBe(1);
    await submitAttempt(d, a.id, { answers: { [quiz.questions[0].id]: { type: 'truefalse', value: true } } });
    await submitAttempt(d, a.id); // submitting again changes nothing
    expect((await d.attempts.get(a.id))?.result?.earned).toBe(1);
    const c = await startAttempt(d, quiz.id, 'سارة');
    expect(c.id).not.toBe(a.id); // a deliberate new attempt after submitting
    expect(await d.attempts.count()).toBe(2);
    expect((await d.attempts.get(a.id))?.status).toBe('submitted'); // the first one is kept as it was
  });

  it('immediate feedback: checking grades and locks the answer; later saves cannot change it', async () => {
    const q1 = tf(true);
    const q2 = tf(false);
    const { d, quiz } = await quizWith([q1, q2], { feedbackTiming: 'immediate' });
    const a = await startAttempt(d, quiz.id, 'سارة');
    await expect(checkAnswer(d, a.id, q1.id, undefined)).rejects.toBeInstanceOf(CheckNotAllowedError);
    const wrong: Answer = { type: 'truefalse', value: false };
    const r = await checkAnswer(d, a.id, q1.id, wrong);
    expect(r.result.status).toBe('incorrect');
    expect(r.attempt.checked).toEqual([q1.id]);
    // Trying to change the locked answer afterwards (save while answering, or at submit) is ignored.
    const right: Answer = { type: 'truefalse', value: true };
    await saveProgress(d, a.id, { [q1.id]: right, [q2.id]: { type: 'truefalse', value: false } }, []);
    expect((await d.attempts.get(a.id))?.answers[q1.id]).toEqual(wrong);
    const again = await checkAnswer(d, a.id, q1.id, right);
    expect(again.result.status).toBe('incorrect');
    const done = await submitAttempt(d, a.id, { answers: { [q1.id]: right, [q2.id]: { type: 'truefalse', value: false } } });
    expect(done.result).toMatchObject({ earned: 1, max: 2, percent: 50 });
  });

  it('checking is refused when the quiz shows feedback only at the end', async () => {
    const q1 = tf(true);
    const { d, quiz } = await quizWith([q1]);
    const a = await startAttempt(d, quiz.id, 'سارة');
    await expect(checkAnswer(d, a.id, q1.id, { type: 'truefalse', value: true })).rejects.toBeInstanceOf(CheckNotAllowedError);
  });

  it('old quizzes and attempts (0.4.0) load with the new settings defaulted', () => {
    const q = normalizeQuiz({ id: 'z', projectId: 'p', settings: { passPercent: 70 }, questions: [{ ...tf(true), bloom: undefined }] })!;
    expect(q.settings).toMatchObject({ passPercent: 70, feedbackTiming: 'end', scorePolicy: 'best' });
    expect(q.questions[0].bloom).toBe(0);
    expect(normalizeQuiz({ id: 'z', projectId: 'p', settings: { feedbackTiming: 'x', scorePolicy: 'last' }, questions: [{ ...tf(true), bloom: 4 }] })).toMatchObject({
      settings: { feedbackTiming: 'end', scorePolicy: 'last' },
      questions: [{ bloom: 4 }],
    });
  });
});

/* ───────── Bloom ───────── */

describe('Bloom levels of questions', () => {
  it('uses the level set on the question, otherwise the highest level of its objectives; warns when "remembering" dominates', () => {
    const levels = new Map<string, 1 | 4>([
      ['o1', 1],
      ['o4', 4],
    ]);
    const of = (id: string) => levels.get(id);
    const a = { ...tf(true), objectiveIds: ['o1'] };
    const b = { ...tf(true), objectiveIds: ['o1', 'o4'] };
    const c = { ...tf(true), objectiveIds: ['o1'], bloom: 3 as const };
    const e = { ...tf(true), objectiveIds: [] };
    expect([a, b, c, e].map((q) => questionBloom(q, of))).toEqual([1, 4, 3, 0]);
    expect(bloomDistribution([a, b, c, e], of)).toMatchObject({ counts: [1, 1, 0, 1, 1, 0, 0], classified: 3, rememberHeavy: false });
    expect(bloomDistribution([a, a, b, e], of).rememberHeavy).toBe(true); // 2 of 3 classified at level 1
    expect(bloomDistribution([a, a], of).rememberHeavy).toBe(false); // too few to judge
  });
});

/* ───────── acceptance test from the plan: 10 attempts vs. a hand calculation ───────── */

describe('acceptance (plan, phase 4): 10 different attempts produce numbers that match a hand calculation', () => {
  it('summary, per question, per objective, per Bloom level and per student (best / last / first)', async () => {
    const d = fresh();
    const p = await createProject(d, { title: 'وحدة الطاقة' });
    const l = await createLesson(d, p.id, { title: 'مصادر الطاقة' });
    const doc = emptyDoc(l.id);
    const O1 = newObjective({ verb: 'يعدّد', content: 'مصادر الطاقة', level: 1 });
    const O2 = newObjective({ verb: 'يقارن', content: 'بين المصادر', level: 4 });
    doc.objectives = [O1, O2];
    await saveLessonEditor(d, l.id, doc, { title: l.title, summary: '', duration: 0, status: 'draft' }, 0);

    const Q1 = newQuestion('mcq') as McqQuestion; // 2 points, single answer, O1
    Q1.prompt = 'مصدر متجدد؟';
    Q1.options = Q1.options.map((o, i) => ({ ...o, text: ['الشمس', 'الفحم', 'النفط', 'الغاز'][i] }));
    Q1.correct = [Q1.options[0].id];
    Q1.points = 2;
    Q1.objectiveIds = [O1.id];
    Q1.feedbackIncorrect = 'الشمس.';
    const Q2 = { ...tf(true, 1), objectiveIds: [O1.id], bloom: 2 as const }; // 1 point, O1, tagged "الفهم"
    const Q3 = newQuestion('mcq') as McqQuestion; // 4 points, several answers {A,C}, partial credit, O2
    Q3.prompt = 'اختر المتجدد';
    Q3.options = Q3.options.map((o, i) => ({ ...o, text: ['الرياح', 'الفحم', 'الشمس', 'النفط'][i] }));
    Q3.correct = [Q3.options[0].id, Q3.options[2].id];
    Q3.multiple = true;
    Q3.partial = true;
    Q3.points = 4;
    Q3.objectiveIds = [O2.id];
    Q3.feedbackIncorrect = 'الرياح والشمس.';
    const Q4 = newQuestion('short') as ShortQuestion; // 3 points, O2
    Q4.prompt = 'أقرب نجم؟';
    Q4.accepted = ['الشمس'];
    Q4.points = 3;
    Q4.objectiveIds = [O2.id];
    Q4.feedbackCorrect = 'أحسنت.';
    const z = await createQuiz(d, p.id, l.id, 'اختبار القبول');
    await saveQuiz(d, { ...z, questions: [Q1, Q2, Q3, Q4], settings: { ...z.settings, passPercent: 60, scorePolicy: 'best' } }, 0);

    const [A, B, C] = [Q3.options[0].id, Q3.options[1].id, Q3.options[2].id];
    const q1 = (ok: boolean): Answer => ({ type: 'mcq', selected: [ok ? Q1.options[0].id : Q1.options[1].id] });
    const q2 = (v: boolean): Answer => ({ type: 'truefalse', value: v });
    const q3 = (sel: string[]): Answer => ({ type: 'mcq', selected: sel });
    const q4 = (t: string): Answer => ({ type: 'short', text: t });
    //            student   Q1     Q2     Q3          Q4         hand-computed total /10
    const plan: [string, Answer, Answer, Answer, Answer | null, number][] = [
      ['سارة', q1(true), q2(true), q3([A, C]), q4('الشمس'), 10], //  2+1+4+3
      ['خالد', q1(false), q2(true), q3([A]), q4('القمر'), 3], //    0+1+2+0
      ['خالد', q1(true), q2(true), q3([A, C, B]), q4('الشمس'), 8], // 2+1+(2-1)/2*4=2 +3
      ['ليلى', q1(true), q2(false), q3([A, B]), q4('شمس'), 5], //   2+0+0+3 («شمس» = «الشمس» without «ال»)
      ['عمر', q1(true), q2(true), q3([C]), null, 5], //             2+1+2+0 (Q4 unanswered)
      ['نور', q1(false), q2(false), q3([]), q4('الشمس'), 3], //     0+0+0+3 (Q3 unanswered)
      ['يوسف', q1(true), q2(true), q3([A, C]), q4('القمر'), 7], //  2+1+4+0
      ['ليلى', q1(true), q2(true), q3([A, C]), q4('الشمس'), 10], // 2+1+4+3
      ['هند', q1(false), q2(true), q3([A]), q4('الشمس'), 6], //     0+1+2+3 = exactly the 60 % pass mark
      ['خالد', q1(false), q2(false), q3([A, B]), q4('القمر'), 0], // 0+0+0+0
    ];
    let t = 1_000_000;
    for (const [name, a1, a2, a3, a4, expected] of plan) {
      const at = await startAttempt(d, z.id, name, { now: (t += 1000) });
      const answers: Record<string, Answer> = { [Q1.id]: a1, [Q2.id]: a2, [Q3.id]: a3 };
      if (a4) answers[Q4.id] = a4;
      const done = await submitAttempt(d, at.id, { answers, now: (t += 1000) });
      expect(done.result!.earned, `${name}: ${expected}`).toBe(expected);
      expect(done.result!.pendingReview).toBe(0);
    }
    // A teacher test run must not change any number.
    await submitAttempt(d, (await startAttempt(d, z.id, 'المعلم', { preview: true })).id);
    const all: Attempt[] = await d.attempts.toArray();

    // Percent per attempt: 100, 30, 80, 50, 50, 30, 70, 100, 60, 0 → sum 570.
    expect(quizSummary(all)).toEqual({ attempts: 10, students: 7, averagePercent: 57, passRate: 50, best: 100, worst: 0, pendingReview: 0 });

    // Per question (share of points, 10 attempts):
    // Q1 6/10 · Q2 7/10 · Q3 (1+.5+.5+0+.5+0+1+1+.5+0)=5/10 · Q4 6/10
    const qs = questionStats(all, [Q1, Q2, Q3, Q4]);
    const by = (id: string) => qs.find((s) => s.questionId === id)!;
    expect(by(Q1.id)).toMatchObject({ averageFraction: 0.6, correct: 6, incorrect: 4, unanswered: 0, difficult: false });
    expect(by(Q2.id)).toMatchObject({ averageFraction: 0.7, correct: 7, incorrect: 3 });
    expect(by(Q3.id)).toMatchObject({ averageFraction: 0.5, correct: 3, partial: 4, incorrect: 2, unanswered: 1, difficult: false });
    expect(by(Q4.id)).toMatchObject({ averageFraction: 0.6, correct: 6, incorrect: 3, unanswered: 1 });

    // Per objective, points-weighted: O1 = Q1+Q2 → 19/30 = 0.633 · O2 = Q3+Q4 → 38/70 = 0.543
    const os = objectiveStats(all);
    expect(os.find((o) => o.objectiveId === O1.id)).toMatchObject({ mastery: 0.633, questions: 2, samples: 10 });
    expect(os.find((o) => o.objectiveId === O2.id)).toMatchObject({ mastery: 0.543, questions: 2, samples: 10 });

    // Per Bloom level: Q1 → level 1 (from O1): 12/20 · Q2 → level 2 (its own tag): 7/10 · Q3+Q4 → level 4 (from O2): 38/70
    const levels = new Map(doc.objectives.map((o) => [o.id, o.level]));
    const bs = bloomStats(all, (q) => questionBloom(q, (id) => levels.get(id)));
    expect(bs).toEqual([
      { level: 1, questions: 1, earned: 12, max: 20, mastery: 0.6 },
      { level: 2, questions: 1, earned: 7, max: 10, mastery: 0.7 },
      { level: 4, questions: 2, earned: 38, max: 70, mastery: 0.543 },
    ]);

    // Per student, "best" attempt: سارة 100 · خالد max(30,80,0)=80 · ليلى max(50,100)=100 · عمر 50 · نور 30 · يوسف 70 · هند 60
    const rows = studentQuizRows(all, () => 'best');
    const pctOf = (name: string, r = rows) => r.find((x) => x.studentName === name)!.counted!.result!.percent;
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.studentName === 'خالد')!.attempts.map((a) => a.result!.percent)).toEqual([30, 80, 0]);
    expect(['سارة', 'خالد', 'ليلى', 'عمر', 'نور', 'يوسف', 'هند'].map((n) => pctOf(n))).toEqual([100, 80, 100, 50, 30, 70, 60]);
    // average of counted = 490 / 7 = 70 ; passed (≥ 60 %) = 5 of 7
    const sums = studentSummaries(rows);
    expect(sums).toHaveLength(7);
    const khalid = sums.find((s) => s.studentName === 'خالد')!;
    expect(khalid).toMatchObject({ quizzes: 1, attempts: 3, averagePercent: 80, passed: 1 });
    const counted = rows.map((r) => r.counted!.result!.percent);
    expect(counted.reduce((s, x) => s + x, 0) / counted.length).toBe(70);
    expect(rows.filter((r) => r.counted!.result!.passed)).toHaveLength(5);
    // "last" and "first" policies: خالد 0 / 30, ليلى 100 / 50
    const last = studentQuizRows(all, () => 'last');
    const first = studentQuizRows(all, () => 'first');
    expect([pctOf('خالد', last), pctOf('ليلى', last)]).toEqual([0, 100]);
    expect([pctOf('خالد', first), pctOf('ليلى', first)]).toEqual([30, 50]);
    // Ties on "best" go to the earlier attempt.
    expect(countedAttempt(all.filter((a) => a.studentName === 'سارة'), 'best')?.result?.percent).toBe(100);
  });
});

/* ───────── upgrade from 0.4.0 ───────── */

describe('migration from phase 3', () => {
  it('a v4 database (with quizzes and attempts) opens as v5 with everything intact; an old open attempt can still be finished', async () => {
    const name = `mig4-${Math.random()}`;
    const v4 = new Dexie(name);
    v4.version(1).stores({ settings: 'key', meta: 'key' });
    v4.version(2).stores({ projects: 'id, updatedAt, createdAt, title, subject, grade, status, *tags', lessons: 'id, projectId, [projectId+order], updatedAt, status, *tags' });
    v4.version(3).stores({ lessonDocs: 'lessonId, updatedAt', assets: 'id, lessonId, kind, createdAt' });
    v4.version(4).stores({ quizzes: 'id, projectId, lessonId, updatedAt', attempts: 'id, quizId, [quizId+studentKey], status, submittedAt' });
    await v4.open();
    const q = tf(true);
    const { bloom: _b, ...oldQ } = q; // 0.4.0 questions had no Bloom field
    void _b;
    const oldSettings = { passPercent: 60, shuffleQuestions: false, shuffleOptions: false, showScore: true, showCorrectAnswers: true, showFeedback: true, maxAttempts: 0, timeLimit: 0 };
    await v4.table('projects').put({ id: 'p1', title: 'قديم', subject: '', grade: '', description: '', status: 'draft', tags: [], color: 'blue', createdAt: 1, updatedAt: 1 });
    await v4.table('quizzes').put({ id: 'z1', projectId: 'p1', lessonId: null, title: 'اختبار قديم', description: '', settings: oldSettings, questions: [oldQ], rev: 2, createdAt: 1, updatedAt: 1 });
    const snapshot = { id: 'z1', title: 'اختبار قديم', settings: oldSettings, questions: [oldQ], rev: 2, lessonId: null, projectId: 'p1' };
    const base = { quizId: 'z1', studentKey: 'ساره', studentName: 'سارة', preview: false, quiz: snapshot, order: [q.id], optionOrder: {}, flagged: [], deadline: null, timedOut: false };
    await v4.table('attempts').put({ ...base, id: 'a1', status: 'submitted', answers: { [q.id]: { type: 'truefalse', value: true } }, startedAt: 1, submittedAt: 2, result: { earned: 1, max: 1, percent: 100, passed: true, pendingReview: 0, questions: [] } });
    await v4.table('attempts').put({ ...base, id: 'a2', status: 'in_progress', answers: { [q.id]: { type: 'truefalse', value: false } }, startedAt: 3, submittedAt: null, result: null });
    v4.close();

    const v5 = new EduDB(name);
    await v5.open();
    expect(v5.verno).toBe(6);
    expect((await loadQuiz(v5, 'z1'))?.settings).toMatchObject({ feedbackTiming: 'end', scorePolicy: 'best' });
    expect((await v5.attempts.get('a1'))?.result?.percent).toBe(100);
    // The old open attempt is resumed (not duplicated) and can be submitted.
    expect((await startAttempt(v5, 'z1', 'سارة')).id).toBe('a2');
    const done = await submitAttempt(v5, 'a2');
    expect(done.result).toMatchObject({ earned: 0, percent: 0 });
    expect(await v5.attempts.count()).toBe(2);
    expect(await v5.progress.count()).toBe(0);
  });
});
