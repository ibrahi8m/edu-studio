import { parseFill } from './grading';
import { matchingChoices } from './model';
import type { Answer, Question } from './types';

const LIST = '، ';

/** The student's answer as readable text (for result pages). */
export function describeAnswer(q: Question, a: Answer | undefined): string {
  if (!a) return 'لم يُجب';
  switch (q.type) {
    case 'mcq': {
      if (a.type !== 'mcq' || !a.selected.length) return 'لم يُجب';
      return q.options.filter((o) => a.selected.includes(o.id)).map((o) => o.text).join(LIST);
    }
    case 'truefalse':
      return a.type === 'truefalse' && a.value !== null ? (a.value ? 'صح' : 'خطأ') : 'لم يُجب';
    case 'short':
      return a.type === 'short' && a.text.trim() ? a.text.trim() : 'لم يُجب';
    case 'matching': {
      if (a.type !== 'matching') return 'لم يُجب';
      const choices = new Map(matchingChoices(q).map((c) => [c.key, c.text]));
      const rows = q.pairs.map((p) => `${p.left} ← ${a.map[p.id] ? choices.get(a.map[p.id]) ?? '؟' : '—'}`);
      return rows.join(' | ');
    }
    case 'ordering': {
      if (a.type !== 'ordering' || !a.touched) return 'لم يُرتّب';
      const byId = new Map(q.items.map((i) => [i.id, i.text]));
      return a.order.map((id, i) => `${i + 1}. ${byId.get(id) ?? '؟'}`).join(' ← ');
    }
    case 'fill': {
      if (a.type !== 'fill' || !a.blanks.some((b) => b?.trim())) return 'لم يُجب';
      return parseFill(q.text)
        .filter((p) => p.kind === 'blank')
        .map((_p, i) => `(${i + 1}) ${a.blanks[i]?.trim() || "—"}`)
        .join('  ');
    }
  }
}

/** The correct answer (or accepted answers) as readable text. */
export function describeCorrect(q: Question): string {
  switch (q.type) {
    case 'mcq':
      return q.options.filter((o) => q.correct.includes(o.id)).map((o) => o.text).join(LIST);
    case 'truefalse':
      return q.answer === null ? '—' : q.answer ? 'صح' : 'خطأ';
    case 'short':
      return q.accepted.filter((x) => x.trim()).join(' أو ');
    case 'matching':
      return q.pairs.map((p) => `${p.left} ← ${p.right}`).join(' | ');
    case 'ordering':
      return q.items.map((i, n) => `${n + 1}. ${i.text}`).join(' ← ');
    case 'fill':
      return parseFill(q.text)
        .filter((p): p is Extract<ReturnType<typeof parseFill>[number], { kind: 'blank' }> => p.kind === 'blank')
        .map((p, i) => `(${i + 1}) ${p.answers.join(' أو ')}`)
        .join('  ');
  }
}

/** The prompt shown for a question (fill questions show their text with blanks as ____). */
export function questionTitle(q: Question): string {
  if (q.type === 'fill') {
    const text = parseFill(q.text)
      .map((p) => (p.kind === 'text' ? p.text : '____'))
      .join('');
    return q.prompt.trim() ? `${q.prompt.trim()} — ${text}` : text;
  }
  return q.prompt;
}

export const STATUS_LABEL: Record<string, string> = {
  correct: 'صحيحة',
  partial: 'صحيحة جزئيًا',
  incorrect: 'خاطئة',
  unanswered: 'بلا إجابة',
  review: 'بانتظار مراجعة المعلم',
};
