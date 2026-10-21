import type { ActivityBlock, LessonDoc } from '../lesson/types';
import type { Attempt } from '../quiz/types';
import type { AssignmentState, Submission } from './types';

/** Learners at or above this percentage in their latest attempt are offered enrichment activities. */
export const ENRICHMENT_PERCENT = 85;

export type Recommendation =
  | { kind: 'none'; reason: string; activities: ActivityBlock[] }
  | { kind: 'remedial' | 'enrichment' | 'on_track'; reason: string; percent: number; passPercent: number; activities: ActivityBlock[] };

/**
 * A fixed, explainable rule (not artificial intelligence): it looks only at the learner's latest
 * submitted attempt in the quizzes linked to this lesson.
 *  - below the quiz's pass mark → remedial activities
 *  - at or above ENRICHMENT_PERCENT → enrichment activities
 *  - otherwise → on track, nothing extra
 * Attempts still waiting for the teacher's marking are judged on the provisional score, and say so.
 */
export function recommend(doc: LessonDoc, attempts: Attempt[]): Recommendation {
  const remedial = doc.blocks.filter((b): b is ActivityBlock => b.type === 'activity' && b.track === 'remedial');
  const enrichment = doc.blocks.filter((b): b is ActivityBlock => b.type === 'activity' && b.track === 'enrichment');
  const done = attempts.filter((a) => a.status === 'submitted' && !a.preview && a.result).sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
  const last = done[0];
  if (!last || !last.result) {
    return { kind: 'none', reason: 'حلّ اختبار الدرس أولًا، وبعدها يقترح عليك التطبيق أنشطة تناسب نتيجتك.', activities: [] };
  }
  const percent = last.result.percent;
  const passPercent = last.quiz.settings.passPercent;
  const provisional = last.result.pendingReview > 0 ? ' (نتيجة مبدئية حتى يصحّح المعلم الإجابات المفتوحة)' : '';
  if (percent < passPercent)
    return { kind: 'remedial', percent, passPercent, activities: remedial, reason: `نتيجتك في آخر محاولة ${percent}٪ وهي أقل من درجة النجاح ${passPercent}٪${provisional}، لذلك نقترح أنشطة علاجية.` };
  if (percent >= ENRICHMENT_PERCENT)
    return { kind: 'enrichment', percent, passPercent, activities: enrichment, reason: `نتيجتك في آخر محاولة ${percent}٪ (${ENRICHMENT_PERCENT}٪ فأكثر)${provisional}، لذلك نقترح أنشطة إثرائية.` };
  return { kind: 'on_track', percent, passPercent, activities: [], reason: `نتيجتك في آخر محاولة ${percent}٪، وقد تجاوزت درجة النجاح ${passPercent}٪${provisional}.` };
}

/** «لم يبدأ / مسودة / قيد الإنجاز / تم التسليم / تم التقييم» from what is actually saved. */
export function assignmentState(sub: Submission | null | undefined, stepsTicked: number): AssignmentState {
  if (sub) return sub.status;
  return stepsTicked > 0 ? 'in_progress' : 'not_started';
}
