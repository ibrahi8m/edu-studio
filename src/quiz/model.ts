import { newId } from '../db/ids';
import { normalizeArabic } from '../db/search';
import { blankCount, parseFill } from './grading';
import { DEFAULT_MATCH } from './textmatch';
import type { BloomLevel } from '../lesson/types';
import type { Attempt, Question, QuestionType, Quiz, QuizSettings, TextMatch } from './types';

export const QUESTION_TYPES: { type: QuestionType; label: string; hint: string }[] = [
  { type: 'mcq', label: 'اختيار من متعدد', hint: 'إجابة صحيحة واحدة أو أكثر' },
  { type: 'truefalse', label: 'صح أو خطأ', hint: 'عبارة يحكم الطالب على صحتها' },
  { type: 'short', label: 'إجابة قصيرة', hint: 'كلمة أو جملة قصيرة يكتبها الطالب' },
  { type: 'matching', label: 'مطابقة', hint: 'يصل كل عنصر بما يناسبه' },
  { type: 'ordering', label: 'ترتيب', hint: 'خطوات أو أحداث بالتسلسل الصحيح' },
  { type: 'fill', label: 'إكمال الفراغات', hint: 'نص فيه فراغات يملؤها الطالب' },
];

export const TYPE_LABEL: Record<QuestionType, string> = Object.fromEntries(QUESTION_TYPES.map((t) => [t.type, t.label])) as Record<QuestionType, string>;

export const DEFAULT_SETTINGS: QuizSettings = {
  passPercent: 60,
  shuffleQuestions: false,
  shuffleOptions: false,
  showScore: true,
  showCorrectAnswers: true,
  showFeedback: true,
  feedbackTiming: 'end',
  scorePolicy: 'best',
  maxAttempts: 0,
  timeLimit: 0,
};

export const FEEDBACK_TIMING_LABEL: Record<QuizSettings['feedbackTiming'], string> = {
  end: 'بعد تسليم الاختبار',
  immediate: 'بعد كل سؤال (تُقفل الإجابة بعد التحقق)',
};

export const SCORE_POLICY_LABEL: Record<QuizSettings['scorePolicy'], string> = {
  best: 'أعلى محاولة',
  last: 'آخر محاولة',
  first: 'أول محاولة',
};

export const LIMITS = { title: 160, description: 3000, prompt: 2000, option: 500, feedback: 1500, points: 100, timeLimit: 300, maxAttempts: 20, questions: 100 };

/* ───────── factories ───────── */

export function newQuestion(type: QuestionType): Question {
  const base = { id: newId(), prompt: '', points: 1, objectiveIds: [] as string[], bloom: 0 as BloomLevel | 0, feedbackCorrect: '', feedbackIncorrect: '' };
  switch (type) {
    case 'mcq': {
      const options = [0, 1, 2, 3].map(() => ({ id: newId(), text: '', feedback: '' }));
      return { ...base, type, options, correct: [], multiple: false, partial: true };
    }
    case 'truefalse':
      return { ...base, type, answer: null };
    case 'short':
      return { ...base, type, accepted: [''], match: { ...DEFAULT_MATCH } };
    case 'matching':
      return { ...base, type, pairs: [0, 1, 2].map(() => ({ id: newId(), left: '', right: '' })), distractors: [], partial: true };
    case 'ordering':
      return { ...base, type, items: [0, 1, 2].map(() => ({ id: newId(), text: '' })), partial: true };
    case 'fill':
      return { ...base, type, text: '', match: { ...DEFAULT_MATCH }, partial: true };
  }
}

export function newQuiz(projectId: string, lessonId: string | null, title: string, description = ''): Quiz {
  const now = Date.now();
  return {
    id: newId(),
    projectId,
    lessonId,
    title: title.trim().slice(0, LIMITS.title),
    description: description.slice(0, LIMITS.description),
    settings: { ...DEFAULT_SETTINGS },
    questions: [],
    rev: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/* ───────── defensive loading ───────── */

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const strArr = (v: unknown, max = 500) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, max)) : []);
const idOf = (v: unknown) => (typeof v === 'string' && v ? v : newId());
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const TYPES: QuestionType[] = ['mcq', 'truefalse', 'short', 'matching', 'ordering', 'fill'];

function normMatch(v: unknown): TextMatch {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const typos = r.typos === 0 || r.typos === 1 || r.typos === 2 ? r.typos : DEFAULT_MATCH.typos;
  return {
    normalize: bool(r.normalize, DEFAULT_MATCH.normalize),
    ignorePunctuation: bool(r.ignorePunctuation, DEFAULT_MATCH.ignorePunctuation),
    typos,
    reviewAllMismatches: bool(r.reviewAllMismatches, DEFAULT_MATCH.reviewAllMismatches),
  };
}

export function normalizeQuestion(raw: unknown): Question | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!TYPES.includes(r.type as QuestionType)) return null;
  const q = newQuestion(r.type as QuestionType);
  q.id = idOf(r.id);
  q.prompt = str(r.prompt, LIMITS.prompt);
  q.points = Math.round(num(r.points, 0, LIMITS.points, 1) * 100) / 100;
  q.objectiveIds = strArr(r.objectiveIds, 100);
  q.bloom = r.bloom === 1 || r.bloom === 2 || r.bloom === 3 || r.bloom === 4 || r.bloom === 5 || r.bloom === 6 ? r.bloom : 0;
  q.feedbackCorrect = str(r.feedbackCorrect, LIMITS.feedback);
  q.feedbackIncorrect = str(r.feedbackIncorrect, LIMITS.feedback);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []) as Record<string, unknown>[];
  switch (q.type) {
    case 'mcq':
      q.options = list(r.options).map((o) => ({ id: idOf(o.id), text: str(o.text, LIMITS.option), feedback: str(o.feedback, LIMITS.feedback) }));
      q.correct = strArr(r.correct, 100).filter((c) => q.options.some((o) => o.id === c));
      q.multiple = bool(r.multiple, false);
      q.partial = bool(r.partial, true);
      if (!q.multiple && q.correct.length > 1) q.correct = q.correct.slice(0, 1);
      break;
    case 'truefalse':
      q.answer = typeof r.answer === 'boolean' ? r.answer : null;
      break;
    case 'short':
      q.accepted = strArr(r.accepted, LIMITS.option);
      q.match = normMatch(r.match);
      break;
    case 'matching':
      q.pairs = list(r.pairs).map((p) => ({ id: idOf(p.id), left: str(p.left, LIMITS.option), right: str(p.right, LIMITS.option) }));
      q.distractors = strArr(r.distractors, LIMITS.option);
      q.partial = bool(r.partial, true);
      break;
    case 'ordering':
      q.items = list(r.items).map((i) => ({ id: idOf(i.id), text: str(i.text, LIMITS.option) }));
      q.partial = bool(r.partial, true);
      break;
    case 'fill':
      q.text = str(r.text, 5000);
      q.match = normMatch(r.match);
      q.partial = bool(r.partial, true);
      break;
  }
  return q;
}

export function normalizeSettings(v: unknown): QuizSettings {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    passPercent: Math.round(num(r.passPercent, 0, 100, d.passPercent)),
    shuffleQuestions: bool(r.shuffleQuestions, d.shuffleQuestions),
    shuffleOptions: bool(r.shuffleOptions, d.shuffleOptions),
    showScore: bool(r.showScore, d.showScore),
    showCorrectAnswers: bool(r.showCorrectAnswers, d.showCorrectAnswers),
    showFeedback: bool(r.showFeedback, d.showFeedback),
    feedbackTiming: r.feedbackTiming === 'immediate' ? 'immediate' : 'end',
    scorePolicy: r.scorePolicy === 'last' || r.scorePolicy === 'first' ? r.scorePolicy : 'best',
    maxAttempts: Math.round(num(r.maxAttempts, 0, LIMITS.maxAttempts, d.maxAttempts)),
    timeLimit: Math.round(num(r.timeLimit, 0, LIMITS.timeLimit, d.timeLimit)),
  };
}

export function normalizeQuiz(raw: unknown): Quiz | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.projectId !== 'string') return null;
  return {
    id: r.id,
    projectId: r.projectId,
    lessonId: typeof r.lessonId === 'string' && r.lessonId ? r.lessonId : null,
    title: str(r.title, LIMITS.title),
    description: str(r.description, LIMITS.description),
    settings: normalizeSettings(r.settings),
    questions: (Array.isArray(r.questions) ? r.questions : []).map(normalizeQuestion).filter((q): q is Question => !!q),
    rev: Number.isInteger(r.rev) && (r.rev as number) >= 0 ? (r.rev as number) : 0,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
  };
}

/* ───────── validation ───────── */

export interface Issue {
  level: 'error' | 'warn';
  text: string;
}

const filled = (s: string) => s.trim().length > 0;

/** Everything a question needs before a student can take it. */
export function validateQuestion(q: Question): Issue[] {
  const out: Issue[] = [];
  const err = (text: string) => out.push({ level: 'error', text });
  const warn = (text: string) => out.push({ level: 'warn', text });
  if (q.type !== 'fill' && !filled(q.prompt)) err('اكتب نص السؤال.');
  if (!(q.points > 0)) err('حدّد درجة أكبر من صفر.');
  switch (q.type) {
    case 'mcq': {
      const opts = q.options.filter((o) => filled(o.text));
      if (opts.length < 2) err('أضف خيارين على الأقل.');
      if (q.options.some((o) => !filled(o.text))) err('أكمل نص كل خيار أو احذف الخيار الفارغ.');
      if (!q.correct.length) err(q.multiple ? 'حدّد الإجابات الصحيحة.' : 'حدّد الإجابة الصحيحة.');
      if (q.multiple && q.correct.length === q.options.length && q.options.length > 1) warn('كل الخيارات صحيحة؛ قد يكون السؤال سهلًا جدًا.');
      const norm = opts.map((o) => normalizeArabic(o.text));
      if (new Set(norm).size < norm.length) err('يوجد خياران متطابقان.');
      break;
    }
    case 'truefalse':
      if (q.answer === null) err('حدّد هل العبارة صحيحة أم خاطئة.');
      break;
    case 'short':
      if (!q.accepted.some(filled)) err('أضف إجابة مقبولة واحدة على الأقل.');
      break;
    case 'matching':
      if (q.pairs.length < 2) err('أضف زوجين على الأقل.');
      if (q.pairs.some((p) => !filled(p.left) || !filled(p.right))) err('أكمل طرفي كل زوج أو احذف الزوج الناقص.');
      {
        const rights = [...q.pairs.map((p) => p.right), ...q.distractors].filter(filled).map(normalizeArabic);
        if (new Set(rights).size < rights.length) err('يوجد عنصران متطابقان في العمود الثاني؛ لن يستطيع الطالب التمييز بينهما.');
      }
      break;
    case 'ordering':
      if (q.items.length < 2) err('أضف عنصرين على الأقل.');
      if (q.items.some((i) => !filled(i.text))) err('أكمل نص كل عنصر أو احذف العنصر الفارغ.');
      break;
    case 'fill': {
      const parts = parseFill(q.text);
      if (blankCount(q.text) === 0) err('أضف فراغًا واحدًا على الأقل بكتابة الإجابة بين [[ و ]].');
      if (parts.some((p) => p.kind === 'blank' && !p.answers.length)) err('يوجد فراغ بلا إجابة: اكتب الإجابة داخل [[ ]].');
      break;
    }
  }
  if (!filled(q.feedbackCorrect) && !filled(q.feedbackIncorrect)) err('أضف تغذية راجعة للطالب (عند الإجابة الصحيحة أو الخاطئة).');
  if (!q.objectiveIds.length) warn('لم يُربط السؤال بهدف تعليمي.');
  if (!q.bloom && !q.objectiveIds.length) warn('لم يُحدَّد مستوى بلوم للسؤال (حدّده أو اربطه بهدف مصنَّف).');
  return out;
}

export interface QuizReadiness {
  ready: boolean;
  problems: { index: number; issues: Issue[] }[];
  quizIssues: string[];
}

export function quizReadiness(q: Quiz): QuizReadiness {
  const quizIssues: string[] = [];
  if (!filled(q.title)) quizIssues.push('اكتب عنوان الاختبار.');
  if (!q.questions.length) quizIssues.push('أضف سؤالًا واحدًا على الأقل.');
  const problems = q.questions.map((qq, index) => ({ index, issues: validateQuestion(qq) })).filter((p) => p.issues.length);
  const ready = !quizIssues.length && !problems.some((p) => p.issues.some((i) => i.level === 'error'));
  return { ready, problems, quizIssues };
}

/* ───────── pure operations ───────── */

const move = <T>(arr: T[], from: number, to: number): T[] => {
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return arr;
  const out = arr.slice();
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
};

export function moveItem<T extends { id: string }>(arr: T[], id: string, dir: -1 | 1): T[] {
  const i = arr.findIndex((x) => x.id === id);
  return move(arr, i, i + dir);
}

export function addQuestion(quiz: Quiz, q: Question, afterId?: string | null): Quiz {
  const questions = quiz.questions.slice();
  const i = afterId ? questions.findIndex((x) => x.id === afterId) : -1;
  if (i >= 0) questions.splice(i + 1, 0, q);
  else questions.push(q);
  return { ...quiz, questions };
}

export function updateQuestion(quiz: Quiz, id: string, patch: Partial<Question>): Quiz {
  return { ...quiz, questions: quiz.questions.map((q) => (q.id === id ? ({ ...q, ...patch, id: q.id, type: q.type } as Question) : q)) };
}

export function removeQuestion(quiz: Quiz, id: string): { quiz: Quiz; removed: Question | null; index: number } {
  const index = quiz.questions.findIndex((q) => q.id === id);
  if (index < 0) return { quiz, removed: null, index };
  return { quiz: { ...quiz, questions: quiz.questions.filter((q) => q.id !== id) }, removed: quiz.questions[index], index };
}

export function insertQuestionAt(quiz: Quiz, q: Question, index: number): Quiz {
  const questions = quiz.questions.slice();
  questions.splice(Math.max(0, Math.min(index, questions.length)), 0, q);
  return { ...quiz, questions };
}

/** Copy with new ids for the question and every option/pair/item; correct answers follow the new ids. */
export function duplicateQuestion(quiz: Quiz, id: string): Quiz {
  const src = quiz.questions.find((q) => q.id === id);
  if (!src) return quiz;
  const copy = structuredClone(src) as Question;
  copy.id = newId();
  if (copy.type === 'mcq') {
    const map = new Map<string, string>();
    copy.options = copy.options.map((o) => {
      const nid = newId();
      map.set(o.id, nid);
      return { ...o, id: nid };
    });
    copy.correct = copy.correct.map((c) => map.get(c)!).filter(Boolean);
  }
  if (copy.type === 'matching') copy.pairs = copy.pairs.map((p) => ({ ...p, id: newId() }));
  if (copy.type === 'ordering') copy.items = copy.items.map((i) => ({ ...i, id: newId() }));
  return addQuestion(quiz, copy, id);
}

/* ───────── attempts ───────── */

export function studentKey(name: string): string {
  return normalizeArabic(name);
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffle that never returns the original order when that is possible (ordering questions). */
export function shuffleChanged<T>(arr: T[], rand: () => number = Math.random): T[] {
  if (arr.length < 2) return arr.slice();
  for (let i = 0; i < 20; i++) {
    const s = shuffle(arr, rand);
    if (s.some((x, k) => x !== arr[k])) return s;
  }
  return [...arr.slice(1), arr[0]];
}

/** Right-side choice keys of a matching question: pair ids, then "d:<n>" for distractors. */
export function matchingChoices(q: Extract<Question, { type: 'matching' }>): { key: string; text: string }[] {
  return [...q.pairs.map((p) => ({ key: p.id, text: p.right })), ...q.distractors.filter(filled).map((t, i) => ({ key: `d:${i}`, text: t }))];
}

export function newAttempt(quiz: Quiz, studentName: string, preview: boolean, now = Date.now(), rand: () => number = Math.random): Attempt {
  const qs = quiz.questions;
  const order = quiz.settings.shuffleQuestions ? shuffle(qs.map((q) => q.id), rand) : qs.map((q) => q.id);
  const optionOrder: Record<string, string[]> = {};
  const answers: Attempt['answers'] = {};
  for (const q of qs) {
    if (q.type === 'mcq') optionOrder[q.id] = quiz.settings.shuffleOptions ? shuffle(q.options.map((o) => o.id), rand) : q.options.map((o) => o.id);
    if (q.type === 'matching') optionOrder[q.id] = shuffle(matchingChoices(q).map((c) => c.key), rand);
    if (q.type === 'ordering') answers[q.id] = { type: 'ordering', order: shuffleChanged(q.items.map((i) => i.id), rand), touched: false };
  }
  return {
    id: newId(),
    quizId: quiz.id,
    studentKey: studentKey(studentName),
    studentName: studentName.trim().slice(0, 80),
    preview,
    status: 'in_progress',
    quiz: { id: quiz.id, title: quiz.title, settings: quiz.settings, questions: quiz.questions, rev: quiz.rev, lessonId: quiz.lessonId, projectId: quiz.projectId },
    order,
    optionOrder,
    answers,
    flagged: [],
    checked: [],
    startedAt: now,
    deadline: quiz.settings.timeLimit > 0 ? now + quiz.settings.timeLimit * 60_000 : null,
    submittedAt: null,
    timedOut: false,
    result: null,
  };
}

/* ───────── Bloom level of a question ───────── */

/**
 * The Bloom level a question measures: the level set on the question, otherwise the highest
 * level among its linked objectives (`levelOf` looks an objective up). 0 = not known.
 */
export function questionBloom(q: Question, levelOf: (objectiveId: string) => BloomLevel | 0 | undefined): BloomLevel | 0 {
  if (q.bloom) return q.bloom;
  let best: BloomLevel | 0 = 0;
  for (const id of q.objectiveIds) {
    const l = levelOf(id) ?? 0;
    if (l > best) best = l;
  }
  return best;
}

export interface BloomDistribution {
  /** Questions per level 1–6 (index 0 = not classified). */
  counts: number[];
  classified: number;
  /** More than half of the classified questions are at "remembering", with at least three classified questions. */
  rememberHeavy: boolean;
}

export function bloomDistribution(questions: Question[], levelOf: (objectiveId: string) => BloomLevel | 0 | undefined): BloomDistribution {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const q of questions) counts[questionBloom(q, levelOf)] += 1;
  const classified = questions.length - counts[0];
  return { counts, classified, rememberHeavy: classified >= 3 && counts[1] * 2 > classified };
}
