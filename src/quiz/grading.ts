import { matchText } from './textmatch';
import type {
  Answer,
  AttemptResult,
  FillQuestion,
  MatchingQuestion,
  McqQuestion,
  OrderingQuestion,
  Question,
  QuestionResult,
  ShortQuestion,
  TrueFalseQuestion,
} from './types';

/* ───────── fill-in-the-blank parsing ───────── */

export type FillPart = { kind: 'text'; text: string } | { kind: 'blank'; index: number; answers: string[] };

const BLANK = /\[\[([^\]]*?)\]\]/g;

/** "الشمس [[نجم|نجمة]] تبعد…" → text and blanks; alternatives separated by |. */
export function parseFill(text: string): FillPart[] {
  const parts: FillPart[] = [];
  let last = 0;
  let index = 0;
  for (const m of text.matchAll(BLANK)) {
    if (m.index! > last) parts.push({ kind: 'text', text: text.slice(last, m.index) });
    const answers = m[1]
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    parts.push({ kind: 'blank', index: index++, answers });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

export function blankCount(text: string): number {
  return parseFill(text).filter((p) => p.kind === 'blank').length;
}

/* ───────── per-type grading (fraction 0–1) ───────── */

interface Graded {
  fraction: number;
  answered: boolean;
  review: boolean;
  notes: string[];
  blanks?: { correct: boolean; review: boolean }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function gradeMcq(q: McqQuestion, a: Answer | undefined): Graded {
  const sel = a?.type === 'mcq' ? a.selected.filter((x) => q.options.some((o) => o.id === x)) : [];
  if (!sel.length) return { fraction: 0, answered: false, review: false, notes: [] };
  const correct = new Set(q.correct);
  if (!q.multiple) return { fraction: correct.has(sel[0]) ? 1 : 0, answered: true, review: false, notes: [] };
  const right = sel.filter((x) => correct.has(x)).length;
  const wrong = sel.length - right;
  if (!q.partial) return { fraction: right === correct.size && wrong === 0 ? 1 : 0, answered: true, review: false, notes: [] };
  const fraction = Math.max(0, (right - wrong) / Math.max(1, correct.size));
  const notes = fraction > 0 && fraction < 1 ? [`${right} اختيار صحيح و${wrong} خاطئ من ${correct.size} صحيحة.`] : [];
  return { fraction, answered: true, review: false, notes };
}

function gradeTrueFalse(q: TrueFalseQuestion, a: Answer | undefined): Graded {
  const v = a?.type === 'truefalse' ? a.value : null;
  if (v === null || v === undefined) return { fraction: 0, answered: false, review: false, notes: [] };
  return { fraction: v === q.answer ? 1 : 0, answered: true, review: false, notes: [] };
}

function gradeShort(q: ShortQuestion, a: Answer | undefined): Graded {
  const text = a?.type === 'short' ? a.text : '';
  const r = matchText(text, q.accepted, q.match);
  if (r.kind === 'empty') return { fraction: 0, answered: false, review: false, notes: [] };
  return { fraction: r.correct ? 1 : 0, answered: true, review: r.review, notes: r.note ? [r.note] : [] };
}

function gradeMatching(q: MatchingQuestion, a: Answer | undefined): Graded {
  const map = a?.type === 'matching' ? a.map : {};
  const chosen = q.pairs.filter((p) => map[p.id]);
  if (!chosen.length) return { fraction: 0, answered: false, review: false, notes: [] };
  const right = q.pairs.filter((p) => map[p.id] === p.id).length;
  const fraction = q.partial ? right / q.pairs.length : right === q.pairs.length ? 1 : 0;
  return { fraction, answered: true, review: false, notes: right < q.pairs.length ? [`${right} من ${q.pairs.length} مطابقات صحيحة.`] : [] };
}

function gradeOrdering(q: OrderingQuestion, a: Answer | undefined): Graded {
  if (a?.type !== 'ordering' || !a.touched) return { fraction: 0, answered: false, review: false, notes: [] };
  const n = q.items.length;
  const inPlace = q.items.filter((it, i) => a.order[i] === it.id).length;
  const fraction = q.partial ? inPlace / n : inPlace === n ? 1 : 0;
  return { fraction, answered: true, review: false, notes: inPlace < n ? [`${inPlace} من ${n} في موضعها الصحيح.`] : [] };
}

function gradeFill(q: FillQuestion, a: Answer | undefined): Graded {
  const blanks = parseFill(q.text).filter((p): p is Extract<FillPart, { kind: 'blank' }> => p.kind === 'blank');
  const given = a?.type === 'fill' ? a.blanks : [];
  if (!blanks.length || !given.some((g) => g?.trim())) return { fraction: 0, answered: false, review: false, notes: [] };
  const per = blanks.map((b) => {
    const r = matchText(given[b.index] ?? '', b.answers, q.match);
    return { correct: r.correct, review: r.review, note: r.note };
  });
  const right = per.filter((p) => p.correct).length;
  const fraction = q.partial ? right / blanks.length : right === blanks.length ? 1 : 0;
  const notes = per.map((p, i) => (p.note ? `الفراغ ${i + 1}: ${p.note}` : '')).filter(Boolean);
  return { fraction, answered: true, review: per.some((p) => p.review), notes, blanks: per.map(({ correct, review }) => ({ correct, review })) };
}

export function gradeQuestion(q: Question, a: Answer | undefined): QuestionResult {
  const g =
    q.type === 'mcq'
      ? gradeMcq(q, a)
      : q.type === 'truefalse'
        ? gradeTrueFalse(q, a)
        : q.type === 'short'
          ? gradeShort(q, a)
          : q.type === 'matching'
            ? gradeMatching(q, a)
            : q.type === 'ordering'
              ? gradeOrdering(q, a)
              : gradeFill(q, a);
  const max = q.points;
  const earned = round2(max * g.fraction);
  const status: QuestionResult['status'] = !g.answered
    ? 'unanswered'
    : g.review
      ? 'review'
      : g.fraction >= 1
        ? 'correct'
        : g.fraction <= 0
          ? 'incorrect'
          : 'partial';
  return {
    questionId: q.id,
    earned,
    max,
    fraction: max > 0 ? earned / max : 0,
    status,
    confidence: g.review ? 'review' : 'certain',
    notes: g.notes,
    blanks: g.blanks,
  };
}

/** Status after a teacher decision (or a recomputation). */
function statusFor(earned: number, max: number): QuestionResult['status'] {
  if (earned >= max) return 'correct';
  if (earned <= 0) return 'incorrect';
  return 'partial';
}

export function summarize(questions: QuestionResult[], passPercent: number): AttemptResult {
  const earned = round2(questions.reduce((s, r) => s + r.earned, 0));
  const max = round2(questions.reduce((s, r) => s + r.max, 0));
  const percent = max > 0 ? Math.round((earned / max) * 1000) / 10 : 0;
  // Compare exact values (not the rounded percent) so 59.96 % never passes a 60 % mark.
  const passed = max > 0 && earned * 100 >= passPercent * max - 1e-9;
  return { earned, max, percent, passed, pendingReview: questions.filter((r) => r.status === 'review').length, questions };
}

export function gradeAttempt(questions: Question[], answers: Record<string, Answer>, passPercent: number): AttemptResult {
  return summarize(
    questions.map((q) => gradeQuestion(q, answers[q.id])),
    passPercent,
  );
}

/** Applies a teacher decision on one question and recomputes the totals. */
export function overrideQuestion(result: AttemptResult, questionId: string, earned: number, passPercent: number, at = Date.now()): AttemptResult {
  const questions = result.questions.map((r) => {
    if (r.questionId !== questionId) return r;
    const e = round2(Math.max(0, Math.min(r.max, earned)));
    return { ...r, earned: e, fraction: r.max > 0 ? e / r.max : 0, status: statusFor(e, r.max), confidence: 'certain' as const, override: { earned: e, at } };
  });
  return summarize(questions, passPercent);
}

export function isAnswered(q: Question, a: Answer | undefined): boolean {
  if (!a) return false;
  switch (q.type) {
    case 'mcq':
      return a.type === 'mcq' && a.selected.length > 0;
    case 'truefalse':
      return a.type === 'truefalse' && a.value !== null;
    case 'short':
      return a.type === 'short' && a.text.trim().length > 0;
    case 'matching':
      return a.type === 'matching' && q.pairs.every((p) => !!a.map[p.id]);
    case 'ordering':
      return a.type === 'ordering' && a.touched;
    case 'fill':
      return a.type === 'fill' && blankCount(q.text) > 0 && parseFill(q.text).every((p) => p.kind !== 'blank' || !!a.blanks[p.index]?.trim());
  }
}

export function totalPoints(questions: Question[]): number {
  return round2(questions.reduce((s, q) => s + q.points, 0));
}
