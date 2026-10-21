import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { EduDB } from '../../src/db/db';
import { createLesson, createProject, deleteProject, restoreProject } from '../../src/db/projects';
import { saveLessonEditor } from '../../src/db/lessonDocs';
import {
  AttemptLimitError,
  createQuiz,
  deleteQuiz,
  findOpenAttempt,
  loadQuiz,
  objectivesFor,
  QuizConflictError,
  restoreQuiz,
  reviewAnswer,
  saveProgress,
  saveQuiz,
  startAttempt,
  submitAttempt,
  usedAttempts,
} from '../../src/db/quizzes';
import { emptyDoc, newObjective } from '../../src/lesson/model';
import { attemptObjectives, objectiveStats, questionStats, quizSummary } from '../../src/quiz/analytics';
import { gradeAttempt, gradeQuestion, isAnswered, overrideQuestion, parseFill, summarize } from '../../src/quiz/grading';
import {
  duplicateQuestion,
  matchingChoices,
  newAttempt,
  newQuestion,
  newQuiz,
  normalizeQuiz,
  quizReadiness,
  shuffleChanged,
  validateQuestion,
} from '../../src/quiz/model';
import { DEFAULT_MATCH, editDistance, matchText } from '../../src/quiz/textmatch';
import type { Answer, FillQuestion, MatchingQuestion, McqQuestion, OrderingQuestion, Question, ShortQuestion, TrueFalseQuestion } from '../../src/quiz/types';

const fresh = () => new EduDB(`q-${Math.random()}`);

/* ───────── builders ───────── */

function mcq(multiple = false, partial = true): McqQuestion {
  const q = newQuestion('mcq') as McqQuestion;
  q.prompt = 'أي مما يلي مصدر متجدد؟';
  q.options = q.options.map((o, i) => ({ ...o, text: ['الشمس', 'الفحم', 'الرياح', 'النفط'][i] }));
  q.correct = multiple ? [q.options[0].id, q.options[2].id] : [q.options[0].id];
  q.multiple = multiple;
  q.partial = partial;
  q.points = 2;
  q.feedbackIncorrect = 'المتجدد لا ينفد.';
  return q;
}
const opt = (q: McqQuestion, i: number) => q.options[i].id;

function short(accepted: string[], patch: Partial<ShortQuestion['match']> = {}): ShortQuestion {
  const q = newQuestion('short') as ShortQuestion;
  q.prompt = 'ما أقرب نجم إلى الأرض؟';
  q.accepted = accepted;
  q.match = { ...DEFAULT_MATCH, ...patch };
  q.feedbackCorrect = 'أحسنت.';
  return q;
}

/* ───────── text matching ───────── */

describe('flexible text matching', () => {
  it('ignores diacritics, hamza forms, ta marbuta, case, punctuation and the definite article', () => {
    expect(matchText('الشَّمْسُ', ['الشمس'], DEFAULT_MATCH)).toMatchObject({ correct: true, kind: 'exact' });
    expect(matchText('الطاقه', ['الطاقة'], DEFAULT_MATCH).correct).toBe(true);
    expect(matchText('إنتاج!', ['انتاج'], DEFAULT_MATCH).correct).toBe(true);
    expect(matchText('Photosynthesis.', ['photosynthesis'], DEFAULT_MATCH).correct).toBe(true);
    expect(matchText('شمس', ['الشمس'], DEFAULT_MATCH)).toMatchObject({ correct: true, kind: 'article' });
  });

  it('accepts the configured number of typos, never on very short words', () => {
    expect(matchText('الكلوروفيل', ['الكلوروفيل'], DEFAULT_MATCH).kind).toBe('exact');
    expect(matchText('الكلوروفل', ['الكلوروفيل'], DEFAULT_MATCH)).toMatchObject({ correct: true, kind: 'typo' });
    expect(matchText('الكلرفل', ['الكلوروفيل'], { ...DEFAULT_MATCH, typos: 0 }).correct).toBe(false);
    expect(matchText('ماء', ['ماء'], DEFAULT_MATCH).correct).toBe(true);
    // 3-letter answer: no typo allowance
    expect(matchText('مال', ['ماء'], DEFAULT_MATCH).correct).toBe(false);
    // short words one letter apart are different words, not typos
    expect(matchText('رماح', ['رياح'], DEFAULT_MATCH)).toMatchObject({ correct: false, review: false });
    expect(matchText('الماء', ['الرياح', 'الهواء'], DEFAULT_MATCH)).toMatchObject({ correct: false, review: false });
    // two typos only on long answers
    expect(matchText('البناء الضوءي', ['البناء الضوئي'], { ...DEFAULT_MATCH, typos: 2 }).correct).toBe(true);
    expect(matchText('التمسيل الضوي', ['التمثيل الضوئي'], { ...DEFAULT_MATCH, typos: 2 })).toMatchObject({ correct: true, kind: 'typo' });
  });

  it('sends uncertain answers to the teacher instead of guessing', () => {
    // one edit beyond the allowance → review
    expect(matchText('الكلرفيل', ['الكلوروفيل'], { ...DEFAULT_MATCH, typos: 1 })).toMatchObject({ correct: false, review: true, kind: 'near' });
    // three letters off is simply wrong
    expect(matchText('الكلرفل', ['الكلوروفيل'], { ...DEFAULT_MATCH, typos: 1 })).toMatchObject({ correct: false, review: false });
    // right answer inside a longer sentence → review
    expect(matchText('أظن أنها الشمس على الأرجح', ['الشمس'], DEFAULT_MATCH)).toMatchObject({ correct: false, review: true, kind: 'contains' });
    // clearly wrong → certain incorrect, unless the teacher asked to review all mismatches
    expect(matchText('القمر', ['الشمس'], DEFAULT_MATCH)).toMatchObject({ correct: false, review: false });
    expect(matchText('القمر', ['الشمس'], { ...DEFAULT_MATCH, reviewAllMismatches: true })).toMatchObject({ correct: false, review: true });
    expect(matchText('   ', ['الشمس'], DEFAULT_MATCH).kind).toBe('empty');
  });

  it('respects turning normalisation off', () => {
    expect(matchText('الطاقه', ['الطاقة'], { ...DEFAULT_MATCH, normalize: false, typos: 0 }).correct).toBe(false);
  });

  it('computes edit distance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('a', 'abcdefgh', 3)).toBe(4);
  });
});

/* ───────── grading every type ───────── */

describe('grading each question type', () => {
  it('multiple choice, single answer', () => {
    const q = mcq();
    expect(gradeQuestion(q, { type: 'mcq', selected: [opt(q, 0)] })).toMatchObject({ earned: 2, status: 'correct' });
    expect(gradeQuestion(q, { type: 'mcq', selected: [opt(q, 1)] })).toMatchObject({ earned: 0, status: 'incorrect' });
    expect(gradeQuestion(q, undefined)).toMatchObject({ earned: 0, status: 'unanswered' });
  });

  it('multiple choice, several answers: partial credit (right minus wrong) or all-or-nothing', () => {
    const q = mcq(true, true);
    expect(gradeQuestion(q, { type: 'mcq', selected: [opt(q, 0), opt(q, 2)] }).earned).toBe(2);
    expect(gradeQuestion(q, { type: 'mcq', selected: [opt(q, 0)] })).toMatchObject({ earned: 1, status: 'partial' });
    expect(gradeQuestion(q, { type: 'mcq', selected: [opt(q, 0), opt(q, 1)] }).earned).toBe(0); // 1 right − 1 wrong
    expect(gradeQuestion(q, { type: 'mcq', selected: [opt(q, 1), opt(q, 3)] }).earned).toBe(0); // never negative
    const strict = mcq(true, false);
    expect(gradeQuestion(strict, { type: 'mcq', selected: [opt(strict, 0)] }).earned).toBe(0);
    expect(gradeQuestion(strict, { type: 'mcq', selected: [opt(strict, 2), opt(strict, 0)] }).earned).toBe(2);
  });

  it('true / false', () => {
    const q = newQuestion('truefalse') as TrueFalseQuestion;
    q.answer = false;
    expect(gradeQuestion(q, { type: 'truefalse', value: false }).status).toBe('correct');
    expect(gradeQuestion(q, { type: 'truefalse', value: true }).status).toBe('incorrect');
    expect(gradeQuestion(q, { type: 'truefalse', value: null }).status).toBe('unanswered');
  });

  it('short answer with review state', () => {
    const q = short(['الشمس']);
    expect(gradeQuestion(q, { type: 'short', text: 'شمس' }).status).toBe('correct');
    const r = gradeQuestion(q, { type: 'short', text: 'هي الشمس طبعا' });
    expect(r).toMatchObject({ status: 'review', confidence: 'review', earned: 0 });
    expect(r.notes[0]).toContain('مراجعة');
  });

  it('matching: per-pair partial credit, distractors are offered but never correct', () => {
    const q = newQuestion('matching') as MatchingQuestion;
    q.pairs = q.pairs.map((p, i) => ({ ...p, left: ['الشمس', 'الرياح', 'الماء'][i], right: ['ألواح شمسية', 'توربينات', 'سدود'][i] }));
    q.distractors = ['مناجم فحم'];
    q.points = 3;
    const [a, b, c] = q.pairs.map((p) => p.id);
    expect(matchingChoices(q).map((x) => x.key)).toEqual([a, b, c, 'd:0']);
    expect(gradeQuestion(q, { type: 'matching', map: { [a]: a, [b]: b, [c]: c } }).earned).toBe(3);
    expect(gradeQuestion(q, { type: 'matching', map: { [a]: a, [b]: c, [c]: 'd:0' } })).toMatchObject({ earned: 1, status: 'partial' });
    q.partial = false;
    expect(gradeQuestion(q, { type: 'matching', map: { [a]: a, [b]: c, [c]: b } }).earned).toBe(0);
    expect(isAnswered(q, { type: 'matching', map: { [a]: a } })).toBe(false);
  });

  it('ordering: positions in place, unanswered until the student touches the list', () => {
    const q = newQuestion('ordering') as OrderingQuestion;
    q.items = q.items.map((it, i) => ({ ...it, text: `خطوة ${i + 1}` }));
    q.points = 3;
    const [x, y, z] = q.items.map((i) => i.id);
    expect(gradeQuestion(q, { type: 'ordering', order: [x, y, z], touched: false }).status).toBe('unanswered');
    expect(gradeQuestion(q, { type: 'ordering', order: [x, y, z], touched: true }).earned).toBe(3);
    expect(gradeQuestion(q, { type: 'ordering', order: [x, z, y], touched: true }).earned).toBe(1);
    q.partial = false;
    expect(gradeQuestion(q, { type: 'ordering', order: [x, z, y], touched: true }).earned).toBe(0);
  });

  it('fill in the blanks: alternatives per blank, partial credit, review per blank', () => {
    const q = newQuestion('fill') as FillQuestion;
    q.text = 'تصنع النباتات غذاءها بعملية [[البناء الضوئي|التمثيل الضوئي]] بوجود [[الكلوروفيل]].';
    q.points = 2;
    const parts = parseFill(q.text);
    expect(parts.filter((p) => p.kind === 'blank')).toHaveLength(2);
    expect(gradeQuestion(q, { type: 'fill', blanks: ['التمثيل الضوئي', 'الكلوروفيل'] }).earned).toBe(2);
    const half = gradeQuestion(q, { type: 'fill', blanks: ['التنفس', 'كلوروفيل'] });
    expect(half).toMatchObject({ earned: 1, status: 'partial' });
    expect(half.blanks).toEqual([
      { correct: false, review: false },
      { correct: true, review: false },
    ]);
    expect(gradeQuestion(q, { type: 'fill', blanks: ['', ''] }).status).toBe('unanswered');
  });
});

/* ───────── totals, percent and pass mark ───────── */

describe('score, percentage and pass mark', () => {
  const qs = (): Question[] => {
    const a = mcq(); // 2 pts
    const b = short(['الشمس']); // 1 pt
    b.points = 1.5;
    const c = newQuestion('truefalse') as TrueFalseQuestion;
    c.answer = true;
    c.points = 0.5;
    return [a, b, c];
  };

  it('adds points, computes the percentage to one decimal and applies the pass mark', () => {
    const [a, b, c] = qs();
    const answers: Record<string, Answer> = {
      [a.id]: { type: 'mcq', selected: [opt(a as McqQuestion, 0)] },
      [b.id]: { type: 'short', text: 'القمر' },
      [c.id]: { type: 'truefalse', value: true },
    };
    const r = gradeAttempt([a, b, c], answers, 60);
    expect(r).toMatchObject({ earned: 2.5, max: 4, percent: 62.5, passed: true, pendingReview: 0 });
    expect(gradeAttempt([a, b, c], answers, 63).passed).toBe(false);
  });

  it('a score exactly on the pass mark passes; one just below fails even if it rounds up', () => {
    const mk = (earned: number, max: number) => summarize([{ questionId: 'x', earned, max, fraction: earned / max, status: 'partial', confidence: 'certain', notes: [] }], 60);
    expect(mk(6, 10).passed).toBe(true);
    const below = mk(59.96, 100);
    expect(below.percent).toBe(60); // displayed rounded…
    expect(below.passed).toBe(false); // …but the decision uses the exact value
    expect(mk(0, 0)).toMatchObject({ percent: 0, passed: false });
  });

  it('a teacher review replaces the provisional score and recomputes the totals', () => {
    const [a, b] = qs();
    const r = gradeAttempt([a, b], { [a.id]: { type: 'mcq', selected: [opt(a as McqQuestion, 0)] }, [b.id]: { type: 'short', text: 'هي الشمس' } }, 60);
    expect(r).toMatchObject({ earned: 2, max: 3.5, pendingReview: 1 });
    const after = overrideQuestion(r, b.id, 1.5, 60, 123);
    expect(after).toMatchObject({ earned: 3.5, percent: 100, pendingReview: 0, passed: true });
    expect(after.questions[1]).toMatchObject({ status: 'correct', override: { earned: 1.5, at: 123 } });
    expect(overrideQuestion(r, b.id, 99, 60).questions[1].earned).toBe(1.5); // clamped to max
  });
});

/* ───────── validation & model ───────── */

describe('question validation and model', () => {
  it('requires text, points, a correct answer or criterion, and feedback', () => {
    for (const t of ['mcq', 'truefalse', 'short', 'matching', 'ordering', 'fill'] as const) {
      const errors = validateQuestion(newQuestion(t)).filter((i) => i.level === 'error');
      expect(errors.length, t).toBeGreaterThan(0);
      expect(errors.some((e) => e.text.includes('تغذية راجعة')), t).toBe(true);
    }
    const ok = mcq();
    ok.objectiveIds = ['o1'];
    expect(validateQuestion(ok)).toEqual([]);
    ok.points = 0;
    expect(validateQuestion(ok).some((i) => i.text.includes('درجة'))).toBe(true);
  });

  it('flags duplicate options and fill text without blanks', () => {
    const q = mcq();
    q.options[1].text = 'الشَّمس';
    expect(validateQuestion(q).some((i) => i.text.includes('متطابقان'))).toBe(true);
    const f = newQuestion('fill') as FillQuestion;
    f.text = 'نص بلا فراغات';
    expect(validateQuestion(f).some((i) => i.text.includes('[['))).toBe(true);
  });

  it('a quiz is ready only with a title and error-free questions', () => {
    const quiz = newQuiz('p', null, 'اختبار');
    expect(quizReadiness(quiz).ready).toBe(false);
    quiz.questions = [mcq()];
    expect(quizReadiness(quiz).ready).toBe(true); // a missing objective is only a warning
    quiz.questions.push(newQuestion('short'));
    expect(quizReadiness(quiz)).toMatchObject({ ready: false, problems: [{ index: 0 }, { index: 1 }] });
  });

  it('duplicates a question with new ids and keeps the correct answers pointing at the copies', () => {
    const quiz = { ...newQuiz('p', null, 'x'), questions: [mcq()] };
    const d = duplicateQuestion(quiz, quiz.questions[0].id);
    const [orig, copy] = d.questions as McqQuestion[];
    expect(copy.id).not.toBe(orig.id);
    expect(copy.options.map((o) => o.id)).not.toEqual(orig.options.map((o) => o.id));
    expect(copy.correct).toEqual([copy.options[0].id]);
  });

  it('repairs damaged stored quizzes and clamps settings', () => {
    const q = normalizeQuiz({ id: 'q', projectId: 'p', title: 5, settings: { passPercent: 400, maxAttempts: -2, timeLimit: 'x' }, questions: [{ type: 'mcq', options: 'bad' }, { type: 'nope' }, null] })!;
    expect(q.settings).toMatchObject({ passPercent: 100, maxAttempts: 0, timeLimit: 0 });
    expect(q.questions).toHaveLength(1);
    expect(q.title).toBe('');
    expect(normalizeQuiz({ id: 'q' })).toBeNull();
  });

  it('builds attempts: shuffles only when asked, and ordering never starts already solved', () => {
    const quiz = newQuiz('p', null, 'x');
    const o = newQuestion('ordering') as OrderingQuestion;
    quiz.questions = [mcq(), short(['أ']), o];
    const plain = newAttempt(quiz, 'سارة', false, 1000);
    expect(plain.order).toEqual(quiz.questions.map((q) => q.id));
    expect(plain.optionOrder[quiz.questions[0].id]).toEqual((quiz.questions[0] as McqQuestion).options.map((x) => x.id));
    expect((plain.answers[o.id] as { order: string[] }).order).not.toEqual(o.items.map((i) => i.id));
    expect(plain.deadline).toBeNull();
    quiz.settings = { ...quiz.settings, shuffleQuestions: true, shuffleOptions: true, timeLimit: 10 };
    let seed = 7;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const shuffled = newAttempt(quiz, 'سارة', false, 1000, rand);
    expect([...shuffled.order].sort()).toEqual(quiz.questions.map((q) => q.id).sort());
    expect(shuffled.deadline).toBe(1000 + 10 * 60_000);
    for (let i = 0; i < 30; i++) expect(shuffleChanged([1, 2, 3])).not.toEqual([1, 2, 3]);
  });
});

/* ───────── storage: quizzes and attempts ───────── */

async function setup() {
  const d = fresh();
  const p = await createProject(d, { title: 'وحدة الطاقة' });
  const l = await createLesson(d, p.id, { title: 'مصادر الطاقة' });
  const doc = emptyDoc(l.id);
  doc.objectives = [newObjective({ verb: 'يعدّد', content: 'مصادر الطاقة', level: 1 }), newObjective({ verb: 'يقارن', content: 'بين نوعين', level: 4 })];
  await saveLessonEditor(d, l.id, doc, { title: l.title, summary: '', duration: 0, status: 'draft' }, 0);
  const quiz = await createQuiz(d, p.id, l.id, 'اختبار الطاقة');
  const q1 = mcq();
  q1.objectiveIds = [doc.objectives[0].id];
  const q2 = short(['الشمس']);
  q2.objectiveIds = [doc.objectives[1].id];
  const saved = { ...quiz, questions: [q1, q2] };
  await saveQuiz(d, saved, 0);
  return { d, p, l, doc, quiz: (await loadQuiz(d, quiz.id))!, q1, q2 };
}

describe('quiz storage', () => {
  it('creates, saves and reopens a quiz after closing the database', async () => {
    const name = `persist-${Math.random()}`;
    const a = new EduDB(name);
    const p = await createProject(a, { title: 'م' });
    const quiz = await createQuiz(a, p.id, null, 'اختبار');
    await saveQuiz(a, { ...quiz, questions: [mcq()], settings: { ...quiz.settings, passPercent: 75 } }, 0);
    a.close();
    const b = new EduDB(name);
    const back = (await loadQuiz(b, quiz.id))!;
    expect(back).toMatchObject({ title: 'اختبار', rev: 1, settings: { passPercent: 75 } });
    expect(back.questions[0].type).toBe('mcq');
  });

  it('refuses a stale save from another window and a lesson from another project', async () => {
    const { d, quiz, p } = await setup();
    await expect(saveQuiz(d, { ...quiz, title: 'قديم' }, quiz.rev - 1)).rejects.toBeInstanceOf(QuizConflictError);
    const other = await createProject(d, { title: 'آخر' });
    const foreign = await createLesson(d, other.id, { title: 'درس آخر' });
    await expect(saveQuiz(d, { ...quiz, lessonId: foreign.id }, quiz.rev)).rejects.toThrow('لا ينتمي');
    await expect(createQuiz(d, p.id, null, '  ')).rejects.toThrow();
  });

  it('lists the lesson objectives a question can measure', async () => {
    const { d, p, l } = await setup();
    const refs = await objectivesFor(d, p.id, l.id);
    expect(refs.map((r) => r.statement)).toEqual(['أن يعدّد الطالب مصادر الطاقة.', 'أن يقارن الطالب بين نوعين.']);
    expect((await objectivesFor(d, p.id, null)).length).toBe(2);
  });

  it('runs an attempt: resume, submit (idempotent), grade from the snapshot, limit attempts', async () => {
    const { d, quiz, q1, q2 } = await setup();
    await saveQuiz(d, { ...quiz, settings: { ...quiz.settings, maxAttempts: 2 } }, quiz.rev);
    const a = await startAttempt(d, quiz.id, ' سارة ');
    expect((await findOpenAttempt(d, quiz.id, 'سارة', false))?.id).toBe(a.id);
    const answers = { [q1.id]: { type: 'mcq', selected: [opt(q1, 0)] }, [q2.id]: { type: 'short', text: 'القمر' } } as Record<string, Answer>;
    await saveProgress(d, a.id, answers, [q2.id]);
    expect((await d.attempts.get(a.id))?.flagged).toEqual([q2.id]);

    // Editing the quiz after the attempt started does not change how it is graded
    const cur = (await loadQuiz(d, quiz.id))!;
    await saveQuiz(d, { ...cur, questions: cur.questions.map((q) => ({ ...q, points: 10 })) }, cur.rev);

    const done = await submitAttempt(d, a.id);
    expect(done.result).toMatchObject({ earned: 2, max: 3, percent: 66.7, passed: true });
    expect((await submitAttempt(d, a.id)).submittedAt).toBe(done.submittedAt);
    await saveProgress(d, a.id, {}, []); // ignored after submit
    expect((await d.attempts.get(a.id))?.answers).toEqual(answers);

    expect(await usedAttempts(d, quiz.id, 'سارة')).toBe(1);
    await submitAttempt(d, (await startAttempt(d, quiz.id, 'سارة')).id);
    await expect(startAttempt(d, quiz.id, 'سارة')).rejects.toBeInstanceOf(AttemptLimitError);
    // a different student, and teacher test runs, are not limited by Sara's attempts
    await expect(startAttempt(d, quiz.id, 'خالد')).resolves.toBeTruthy();
    const p1 = await startAttempt(d, quiz.id, 'المعلم', { preview: true });
    const p2 = await startAttempt(d, quiz.id, 'المعلم', { preview: true });
    expect(await d.attempts.get(p1.id)).toBeUndefined(); // previous test run replaced
    expect(p2.preview).toBe(true);
  });

  it('teacher review updates a stored attempt', async () => {
    const { d, quiz, q1, q2 } = await setup();
    const a = await startAttempt(d, quiz.id, 'ليلى');
    const done = await submitAttempt(d, a.id, { answers: { [q1.id]: { type: 'mcq', selected: [opt(q1, 1)] }, [q2.id]: { type: 'short', text: 'إنها الشمس' } } });
    expect(done.result).toMatchObject({ earned: 0, pendingReview: 1 });
    const reviewed = await reviewAnswer(d, a.id, q2.id, 1);
    expect(reviewed.result).toMatchObject({ earned: 1, pendingReview: 0 });
    expect((await d.attempts.get(a.id))?.result?.earned).toBe(1);
  });

  it('deleting a quiz removes its attempts; undo restores both. Deleting the project removes quizzes too', async () => {
    const { d, quiz, p } = await setup();
    await submitAttempt(d, (await startAttempt(d, quiz.id, 'أحمد')).id);
    const snap = await deleteQuiz(d, quiz.id);
    expect(snap.attempts).toHaveLength(1);
    expect(await d.attempts.count()).toBe(0);
    await restoreQuiz(d, snap);
    expect(await d.attempts.count()).toBe(1);
    const ps = await deleteProject(d, p.id);
    expect(ps.quizzes).toHaveLength(1);
    expect(await d.quizzes.count()).toBe(0);
    expect(await d.attempts.count()).toBe(0);
    await restoreProject(d, ps);
    expect(await d.quizzes.count()).toBe(1);
    expect(await d.attempts.count()).toBe(1);
  });
});

/* ───────── analytics ───────── */

describe('results analytics', () => {
  it('summarises only real submitted attempts and finds hard questions and objective mastery', async () => {
    const { d, quiz, q1, q2, doc } = await setup();
    const run = async (name: string, mcqIdx: number, text: string) =>
      submitAttempt(d, (await startAttempt(d, quiz.id, name)).id, {
        answers: { [q1.id]: { type: 'mcq', selected: [opt(q1, mcqIdx)] }, [q2.id]: { type: 'short', text } },
      });
    await run('أ', 0, 'القمر'); // 2/3
    await run('ب', 0, 'الشمس'); // 3/3
    await run('ج', 1, 'المريخ'); // 0/3
    await startAttempt(d, quiz.id, 'د'); // in progress: ignored
    await submitAttempt(d, (await startAttempt(d, quiz.id, 'المعلم', { preview: true })).id); // preview: ignored
    const all = await d.attempts.toArray();
    expect(quizSummary(all)).toMatchObject({ attempts: 3, students: 3, averagePercent: 55.6, passRate: 66.7, best: 100, worst: 0 });
    const qs = questionStats(all, quiz.questions);
    expect(qs.find((s) => s.questionId === q1.id)).toMatchObject({ averageFraction: 0.667, correct: 2, incorrect: 1, difficult: false });
    expect(qs.find((s) => s.questionId === q2.id)).toMatchObject({ averageFraction: 0.333, difficult: true });
    const os = objectiveStats(all);
    expect(os.find((o) => o.objectiveId === doc.objectives[0].id)?.mastery).toBe(0.667);
    expect(os.find((o) => o.objectiveId === doc.objectives[1].id)?.mastery).toBe(0.333);
    const one = attemptObjectives(all.find((a) => a.studentName === 'ب')!);
    expect(one.every((o) => o.mastery === 1)).toBe(true);
    expect(quizSummary([])).toMatchObject({ attempts: 0, averagePercent: 0 });
  });
});

/* ───────── migration ───────── */

describe('migration from phase 2', () => {
  it('a v3 database (projects, lessons, content, media) opens as v4 with everything intact', async () => {
    const name = `mig3-${Math.random()}`;
    const v3 = new Dexie(name);
    v3.version(1).stores({ settings: 'key', meta: 'key' });
    v3.version(2).stores({ projects: 'id, updatedAt, createdAt, title, subject, grade, status, *tags', lessons: 'id, projectId, [projectId+order], updatedAt, status, *tags' });
    v3.version(3).stores({ lessonDocs: 'lessonId, updatedAt', assets: 'id, lessonId, kind, createdAt' });
    await v3.open();
    await v3.table('settings').put({ key: 'theme', value: 'light', updatedAt: 1 });
    await v3.table('projects').put({ id: 'p1', title: 'قديم', subject: '', grade: '', description: '', status: 'draft', tags: [], color: 'blue', createdAt: 1, updatedAt: 1 });
    await v3.table('lessons').put({ id: 'l1', projectId: 'p1', title: 'درس', summary: '', duration: 0, status: 'draft', tags: [], order: 1, createdAt: 1, updatedAt: 1 });
    await v3.table('lessonDocs').put({ ...emptyDoc('l1'), objectives: [newObjective({ verb: 'يذكر', content: 'مثالًا', level: 1 })], rev: 3 });
    await v3.table('assets').put({ id: 'a1', lessonId: 'l1', kind: 'image', mime: 'image/png', name: 'x.png', size: 3, data: new Uint8Array([1, 2, 3]).buffer, createdAt: 1 });
    v3.close();

    const v4 = new EduDB(name);
    await v4.open();
    expect(v4.verno).toBe(8);
    expect((await v4.projects.get('p1'))?.title).toBe('قديم');
    expect((await v4.lessons.get('l1'))?.title).toBe('درس');
    expect((await v4.lessonDocs.get('l1'))?.rev).toBe(3);
    expect(new Uint8Array((await v4.assets.get('a1'))!.data)).toEqual(new Uint8Array([1, 2, 3]));
    expect((await v4.settings.get('theme'))?.value).toBe('light');
    expect(await v4.quizzes.count()).toBe(0);
    const refs = await objectivesFor(v4, 'p1', 'l1');
    expect(refs[0].statement).toBe('أن يذكر الطالب مثالًا.');
  });
});
