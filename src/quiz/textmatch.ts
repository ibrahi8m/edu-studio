import { normalizeArabic } from '../db/search';
import type { TextMatch } from './types';

export const DEFAULT_MATCH: TextMatch = { normalize: true, ignorePunctuation: true, typos: 1, reviewAllMismatches: false };

/** Canonical form of a typed answer under the question's matching rules. */
export function canon(input: string, m: TextMatch): string {
  let t = m.normalize ? normalizeArabic(input) : input.replace(/\s+/g, ' ').trim();
  if (m.ignorePunctuation) t = t.replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

/** «الشمس» and «شمس» compare equal when normalising (definite article on each word). */
function stripArticles(t: string): string {
  return t
    .split(' ')
    .map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w))
    .join(' ');
}

/** Edit distance (insert / delete / substitute), stops early above `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Typos allowed for an accepted answer of this length (measured without «ال»).
 * Short Arabic words differ from other real words by one letter (رياح / رماح),
 * so no tolerance below 5 letters, and two typos only from 9 letters.
 */
export const TYPO_MIN_LENGTH = { one: 5, two: 9, review: 6 };
function allowedTypos(acceptedLength: number, setting: 0 | 1 | 2): number {
  if (acceptedLength < TYPO_MIN_LENGTH.one) return 0;
  if (acceptedLength < TYPO_MIN_LENGTH.two) return Math.min(setting, 1);
  return setting;
}

export type MatchKind = 'empty' | 'exact' | 'article' | 'typo' | 'near' | 'contains' | 'mismatch';

export interface TextMatchResult {
  correct: boolean;
  /** The grader is not sure: the teacher should decide. */
  review: boolean;
  kind: MatchKind;
  note?: string;
}

/**
 * Compares a typed answer with the accepted answers.
 * certain-correct: exact (after normalising), or within the allowed typos.
 * review: one typo beyond the allowance, the right answer inside a longer
 *         sentence, or (if the teacher chose so) any other non-empty answer.
 */
export function matchText(answer: string, accepted: string[], m: TextMatch): TextMatchResult {
  const a = canon(answer ?? '', m);
  if (!a) return { correct: false, review: false, kind: 'empty' };
  const accs = accepted.map((x) => canon(x, m)).filter(Boolean);
  if (accs.includes(a)) return { correct: true, review: false, kind: 'exact' };
  if (m.normalize) {
    const sa = stripArticles(a);
    if (accs.some((x) => stripArticles(x) === sa)) return { correct: true, review: false, kind: 'article', note: 'طابق الإجابة دون «ال» التعريف.' };
  }
  // Smallest number of edits beyond what is allowed, over all accepted answers.
  let minExcess = Infinity;
  const core = m.normalize ? stripArticles(a) : a;
  for (const x of accs) {
    // Allowance and distance both measured without «ال», so «القمر» is not "close" to «الشمس».
    const target = m.normalize ? stripArticles(x) : x;
    const allowed = allowedTypos(target.length, m.typos);
    const d = editDistance(core, target, 4);
    if (d <= allowed) return { correct: true, review: false, kind: 'typo', note: d === 1 ? 'قُبلت مع خطأ إملائي واحد.' : `قُبلت مع ${d} أخطاء إملائية.` };
    // "Close enough to ask the teacher" only for longer answers, where one extra slip is meaningful.
    if (target.length >= TYPO_MIN_LENGTH.review) minExcess = Math.min(minExcess, d - allowed);
  }
  if (minExcess === 1) return { correct: false, review: true, kind: 'near', note: 'قريبة من الإجابة الصحيحة: تحتاج مراجعة المعلم.' };
  const padded = ` ${a} `;
  if (accs.some((x) => x.length >= 2 && padded.includes(` ${x} `)))
    return { correct: false, review: true, kind: 'contains', note: 'تتضمن الإجابة الصحيحة ضمن نص أطول: تحتاج مراجعة المعلم.' };
  if (m.reviewAllMismatches) return { correct: false, review: true, kind: 'mismatch', note: 'لا تطابق الإجابات المقبولة: أُرسلت لمراجعة المعلم.' };
  return { correct: false, review: false, kind: 'mismatch' };
}
