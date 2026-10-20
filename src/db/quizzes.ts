import { objectiveStatement } from '../lesson/bloom';
import { normalizeDoc } from '../lesson/model';
import type { BloomLevel, Objective } from '../lesson/types';
import { gradeAttempt, gradeQuestion, isAnswered, overrideQuestion } from '../quiz/grading';
import { newAttempt, newQuiz, normalizeQuiz, studentKey } from '../quiz/model';
import type { Answer, Attempt, QuestionResult, Quiz } from '../quiz/types';
import type { EduDB } from './db';
import { ValidationError } from './projects';

export class QuizConflictError extends Error {
  constructor(public currentRev: number) {
    super('عُدّل هذا الاختبار في نافذة أخرى بعد فتحه هنا.');
  }
}

export class AttemptLimitError extends Error {
  constructor(public max: number) {
    super(`استُنفدت المحاولات المسموح بها (${max}).`);
  }
}

/* ───────── quizzes ───────── */

async function checkLinks(database: EduDB, projectId: string, lessonId: string | null) {
  if (!(await database.projects.get(projectId))) throw new Error('المشروع غير موجود.');
  if (lessonId) {
    const l = await database.lessons.get(lessonId);
    if (!l || l.projectId !== projectId) throw new Error('الدرس المختار لا ينتمي إلى هذا المشروع.');
  }
}

export async function createQuiz(database: EduDB, projectId: string, lessonId: string | null, title: string, description = ''): Promise<Quiz> {
  if (!title.trim()) throw new ValidationError({ title: 'عنوان الاختبار مطلوب.' });
  return database.transaction('rw', [database.projects, database.lessons, database.quizzes], async () => {
    await checkLinks(database, projectId, lessonId);
    const q = newQuiz(projectId, lessonId, title, description);
    await database.quizzes.add(q);
    return q;
  });
}

export async function loadQuiz(database: EduDB, id: string): Promise<Quiz | null> {
  return normalizeQuiz(await database.quizzes.get(id));
}

export interface QuizSaveResult {
  rev: number;
  savedAt: number;
}

/** Saves the quiz unless another window saved a newer revision since `baseRev` (or `force`). */
export async function saveQuiz(database: EduDB, quiz: Quiz, baseRev: number, opts: { force?: boolean } = {}): Promise<QuizSaveResult> {
  if (!quiz.title.trim()) throw new ValidationError({ title: 'عنوان الاختبار مطلوب.' });
  return database.transaction('rw', [database.projects, database.lessons, database.quizzes], async () => {
    const stored = await database.quizzes.get(quiz.id);
    if (!stored) throw new Error('الاختبار غير موجود؛ ربما حُذف.');
    if (!opts.force && stored.rev !== baseRev) throw new QuizConflictError(stored.rev);
    await checkLinks(database, quiz.projectId, quiz.lessonId);
    const now = Date.now();
    const rev = stored.rev + 1;
    const clean = normalizeQuiz({ ...quiz, rev, updatedAt: Math.max(now, stored.updatedAt + 1), createdAt: stored.createdAt })!;
    await database.quizzes.put(clean);
    return { rev, savedAt: now };
  });
}

export interface QuizSnapshot {
  quiz: Quiz;
  attempts: Attempt[];
}

export async function deleteQuiz(database: EduDB, id: string): Promise<QuizSnapshot> {
  return database.transaction('rw', [database.quizzes, database.attempts], async () => {
    const quiz = await database.quizzes.get(id);
    if (!quiz) throw new Error('الاختبار غير موجود.');
    const attempts = await database.attempts.where('quizId').equals(id).toArray();
    await database.attempts.where('quizId').equals(id).delete();
    await database.quizzes.delete(id);
    return { quiz, attempts };
  });
}

export async function restoreQuiz(database: EduDB, snap: QuizSnapshot): Promise<void> {
  await database.transaction('rw', [database.projects, database.quizzes, database.attempts], async () => {
    if (!(await database.projects.get(snap.quiz.projectId))) throw new Error('المشروع الأصلي لم يعد موجودًا.');
    await database.quizzes.put(snap.quiz);
    if (snap.attempts.length) await database.attempts.bulkPut(snap.attempts);
  });
}

/* ───────── objectives available to a quiz ───────── */

export interface ObjectiveRef {
  objective: Objective;
  lessonId: string;
  lessonTitle: string;
  /** 1-based position inside its lesson. */
  number: number;
  statement: string;
  level: BloomLevel | 0;
}

/** Objectives of the quiz's lesson, or of every lesson in the project when no lesson is linked. */
export async function objectivesFor(database: EduDB, projectId: string, lessonId: string | null): Promise<ObjectiveRef[]> {
  const lessons = lessonId
    ? [await database.lessons.get(lessonId)].filter((l): l is NonNullable<typeof l> => !!l)
    : (await database.lessons.where('projectId').equals(projectId).toArray()).sort((a, b) => a.order - b.order);
  const docs = await database.lessonDocs.bulkGet(lessons.map((l) => l.id));
  const out: ObjectiveRef[] = [];
  lessons.forEach((l, i) => {
    const doc = normalizeDoc(docs[i], l.id);
    doc.objectives.forEach((o, n) => {
      const statement = objectiveStatement(o, doc.audience);
      if (!statement) return;
      out.push({ objective: o, lessonId: l.id, lessonTitle: l.title, number: n + 1, statement, level: o.level });
    });
  });
  return out;
}

/* ───────── attempts ───────── */

export async function usedAttempts(database: EduDB, quizId: string, name: string): Promise<number> {
  return database.attempts
    .where('[quizId+studentKey]')
    .equals([quizId, studentKey(name)])
    .filter((a) => a.status === 'submitted' && !a.preview)
    .count();
}

export async function findOpenAttempt(database: EduDB, quizId: string, name: string, preview: boolean): Promise<Attempt | null> {
  const open = await database.attempts
    .where('[quizId+studentKey]')
    .equals([quizId, studentKey(name)])
    .filter((a) => a.status === 'in_progress' && a.preview === preview)
    .sortBy('startedAt');
  return open.at(-1) ?? null;
}

/**
 * Starts a new attempt (checking the attempt limit) and stores it immediately.
 * A student who already has an unfinished attempt gets that attempt back instead of a second one,
 * so reopening the page, a double click or a second tab can never open (or count) two attempts.
 */
export async function startAttempt(database: EduDB, quizId: string, name: string, opts: { preview?: boolean; now?: number } = {}): Promise<Attempt> {
  const preview = !!opts.preview;
  if (!name.trim()) throw new ValidationError({ title: 'اكتب اسم الطالب.' });
  return database.transaction('rw', [database.quizzes, database.attempts], async () => {
    const quiz = normalizeQuiz(await database.quizzes.get(quizId));
    if (!quiz) throw new Error('الاختبار غير موجود.');
    if (!preview) {
      const open = await findOpenAttempt(database, quizId, name, false);
      if (open) return open;
    }
    if (preview) {
      // A teacher test run replaces the previous one; it is never counted.
      await database.attempts.where('quizId').equals(quizId).filter((a) => a.preview).delete();
    } else if (quiz.settings.maxAttempts > 0) {
      const used = await usedAttempts(database, quizId, name);
      if (used >= quiz.settings.maxAttempts) throw new AttemptLimitError(quiz.settings.maxAttempts);
    }
    const a = newAttempt(quiz, name, preview, opts.now);
    await database.attempts.add(a);
    return a;
  });
}

/** Answers of checked questions (immediate feedback) are locked: the stored answer always wins. */
function keepLocked(stored: Attempt, answers: Record<string, Answer>): Record<string, Answer> {
  const out = { ...answers };
  for (const id of stored.checked ?? []) if (stored.answers[id]) out[id] = stored.answers[id];
  return out;
}

export async function saveProgress(database: EduDB, attemptId: string, answers: Record<string, Answer>, flagged: string[]): Promise<void> {
  await database.transaction('rw', database.attempts, async () => {
    const a = await database.attempts.get(attemptId);
    if (!a || a.status !== 'in_progress') return;
    await database.attempts.update(attemptId, { answers: keepLocked(a, answers), flagged });
  });
}

export class CheckNotAllowedError extends Error {}

/**
 * Immediate-feedback mode: grades one answer, stores it and locks it.
 * Checking the same question again returns the stored result without changing anything.
 */
export async function checkAnswer(database: EduDB, attemptId: string, questionId: string, answer: Answer | undefined): Promise<{ attempt: Attempt; result: QuestionResult }> {
  return database.transaction('rw', database.attempts, async () => {
    const a = await database.attempts.get(attemptId);
    if (!a || a.status !== 'in_progress') throw new CheckNotAllowedError('المحاولة مغلقة.');
    if (a.quiz.settings.feedbackTiming !== 'immediate') throw new CheckNotAllowedError('هذا الاختبار يعرض التغذية الراجعة بعد التسليم فقط.');
    const q = a.quiz.questions.find((x) => x.id === questionId);
    if (!q) throw new CheckNotAllowedError('السؤال غير موجود.');
    const checked = a.checked ?? [];
    if (checked.includes(questionId)) return { attempt: a, result: gradeQuestion(q, a.answers[questionId]) };
    if (!isAnswered(q, answer)) throw new CheckNotAllowedError('أجب عن السؤال أولًا.');
    const next: Attempt = { ...a, answers: { ...a.answers, [questionId]: answer! }, checked: [...checked, questionId] };
    await database.attempts.put(next);
    return { attempt: next, result: gradeQuestion(q, answer) };
  });
}

/** Grades and closes the attempt. Safe to call twice: a submitted attempt is returned unchanged. */
export async function submitAttempt(
  database: EduDB,
  attemptId: string,
  opts: { answers?: Record<string, Answer>; timedOut?: boolean; now?: number } = {},
): Promise<Attempt> {
  return database.transaction('rw', database.attempts, async () => {
    const a = await database.attempts.get(attemptId);
    if (!a) throw new Error('المحاولة غير موجودة.');
    if (a.status === 'submitted') return a;
    const answers = keepLocked(a, opts.answers ?? a.answers);
    const result = gradeAttempt(a.quiz.questions, answers, a.quiz.settings.passPercent);
    const done: Attempt = { ...a, answers, status: 'submitted', submittedAt: opts.now ?? Date.now(), timedOut: !!opts.timedOut, result };
    await database.attempts.put(done);
    return done;
  });
}

/** Teacher decision on one answer (e.g. a short answer the grader was unsure about). */
export async function reviewAnswer(database: EduDB, attemptId: string, questionId: string, earned: number): Promise<Attempt> {
  return database.transaction('rw', database.attempts, async () => {
    const a = await database.attempts.get(attemptId);
    if (!a || !a.result) throw new Error('المحاولة غير موجودة أو لم تُسلَّم.');
    const result = overrideQuestion(a.result, questionId, earned, a.quiz.settings.passPercent);
    const next = { ...a, result };
    await database.attempts.put(next);
    return next;
  });
}

export async function deleteAttempt(database: EduDB, id: string): Promise<Attempt> {
  return database.transaction('rw', database.attempts, async () => {
    const a = await database.attempts.get(id);
    if (!a) throw new Error('المحاولة غير موجودة.');
    await database.attempts.delete(id);
    return a;
  });
}

export async function restoreAttempt(database: EduDB, a: Attempt): Promise<void> {
  await database.attempts.put(a);
}
