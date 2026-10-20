import type { Attempt, Question } from './types';

/** Only real, submitted attempts count; teacher test runs are excluded. */
export function countable(attempts: Attempt[]): Attempt[] {
  return attempts.filter((a) => a.status === 'submitted' && !a.preview && a.result);
}

export interface QuizSummary {
  attempts: number;
  students: number;
  averagePercent: number;
  passRate: number;
  best: number;
  worst: number;
  pendingReview: number;
}

export function quizSummary(attempts: Attempt[]): QuizSummary {
  const done = countable(attempts);
  if (!done.length) return { attempts: 0, students: 0, averagePercent: 0, passRate: 0, best: 0, worst: 0, pendingReview: 0 };
  const pct = done.map((a) => a.result!.percent);
  return {
    attempts: done.length,
    students: new Set(done.map((a) => a.studentKey)).size,
    averagePercent: Math.round((pct.reduce((s, x) => s + x, 0) / done.length) * 10) / 10,
    passRate: Math.round((done.filter((a) => a.result!.passed).length / done.length) * 1000) / 10,
    best: Math.max(...pct),
    worst: Math.min(...pct),
    pendingReview: done.reduce((s, a) => s + a.result!.pendingReview, 0),
  };
}

export interface QuestionStat {
  questionId: string;
  /** The most recent version of the question seen in an attempt (or the current quiz). */
  question: Question | null;
  answered: number;
  /** Average share of the points earned, 0–1, over attempts that include the question. */
  averageFraction: number;
  correct: number;
  incorrect: number;
  partial: number;
  unanswered: number;
  review: number;
  seen: number;
  /** Often answered wrongly: average below 50 %. */
  difficult: boolean;
}

/** Per question, across attempts. `current` supplies the question text for ordering and labels. */
export function questionStats(attempts: Attempt[], current: Question[]): QuestionStat[] {
  const done = countable(attempts);
  const latest = new Map<string, Question>();
  for (const a of [...done].sort((x, y) => (x.submittedAt ?? 0) - (y.submittedAt ?? 0))) for (const q of a.quiz.questions) latest.set(q.id, q);
  for (const q of current) latest.set(q.id, q);
  const ids = [...current.map((q) => q.id), ...[...latest.keys()].filter((id) => !current.some((q) => q.id === id))];
  return ids
    .map((id) => {
      const rows = done.map((a) => a.result!.questions.find((r) => r.questionId === id)).filter((r): r is NonNullable<typeof r> => !!r);
      const seen = rows.length;
      const avg = seen ? rows.reduce((s, r) => s + r.fraction, 0) / seen : 0;
      return {
        questionId: id,
        question: latest.get(id) ?? null,
        seen,
        answered: rows.filter((r) => r.status !== 'unanswered').length,
        averageFraction: Math.round(avg * 1000) / 1000,
        correct: rows.filter((r) => r.status === 'correct').length,
        incorrect: rows.filter((r) => r.status === 'incorrect').length,
        partial: rows.filter((r) => r.status === 'partial').length,
        unanswered: rows.filter((r) => r.status === 'unanswered').length,
        review: rows.filter((r) => r.status === 'review').length,
        difficult: seen > 0 && avg < 0.5,
      };
    })
    .filter((s) => s.seen > 0 || current.some((q) => q.id === s.questionId));
}

export interface ObjectiveStat {
  objectiveId: string;
  questions: number;
  /** Average share of points earned on the questions measuring this objective, 0–1. */
  mastery: number;
  samples: number;
}

function objectiveRows(a: Attempt): Map<string, { earned: number; max: number; questions: Set<string> }> {
  const m = new Map<string, { earned: number; max: number; questions: Set<string> }>();
  for (const q of a.quiz.questions) {
    const r = a.result?.questions.find((x) => x.questionId === q.id);
    if (!r) continue;
    for (const o of q.objectiveIds) {
      const cur = m.get(o) ?? { earned: 0, max: 0, questions: new Set<string>() };
      cur.earned += r.earned;
      cur.max += r.max;
      cur.questions.add(q.id);
      m.set(o, cur);
    }
  }
  return m;
}

/** Mastery of each objective in one attempt (points earned / points available on its questions). */
export function attemptObjectives(a: Attempt): ObjectiveStat[] {
  return [...objectiveRows(a).entries()].map(([objectiveId, v]) => ({
    objectiveId,
    questions: v.questions.size,
    mastery: v.max > 0 ? Math.round((v.earned / v.max) * 1000) / 1000 : 0,
    samples: 1,
  }));
}

/** Mastery of each objective over all attempts (points-weighted). */
export function objectiveStats(attempts: Attempt[]): ObjectiveStat[] {
  const total = new Map<string, { earned: number; max: number; questions: Set<string>; samples: number }>();
  for (const a of countable(attempts)) {
    for (const [o, v] of objectiveRows(a)) {
      const cur = total.get(o) ?? { earned: 0, max: 0, questions: new Set<string>(), samples: 0 };
      cur.earned += v.earned;
      cur.max += v.max;
      v.questions.forEach((q) => cur.questions.add(q));
      cur.samples += 1;
      total.set(o, cur);
    }
  }
  return [...total.entries()].map(([objectiveId, v]) => ({
    objectiveId,
    questions: v.questions.size,
    mastery: v.max > 0 ? Math.round((v.earned / v.max) * 1000) / 1000 : 0,
    samples: v.samples,
  }));
}
