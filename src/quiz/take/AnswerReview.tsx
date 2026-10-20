import type { ReactNode } from 'react';
import { CheckCircle2, CircleDashed, Hourglass, MinusCircle, XCircle } from 'lucide-react';
import { describeAnswer, describeCorrect, questionTitle, STATUS_LABEL } from '../describe';
import type { Answer, Question, QuestionResult } from '../types';

const ICON = { correct: CheckCircle2, partial: MinusCircle, incorrect: XCircle, unanswered: CircleDashed, review: Hourglass };

/** One graded question in a result page. What is shown follows the quiz settings (or everything, for the teacher). */
export function AnswerReview({
  q,
  r,
  answer,
  number,
  show,
  children,
}: {
  q: Question;
  r: QuestionResult;
  answer: Answer | undefined;
  number: number;
  show: { correctness: boolean; correct: boolean; feedback: boolean; notes?: boolean };
  children?: ReactNode;
}) {
  const Icon = ICON[r.status];
  const right = r.status === 'correct';
  const chosen = q.type === 'mcq' && answer?.type === 'mcq' ? q.options.filter((o) => answer.selected.includes(o.id) && o.feedback.trim()) : [];
  const feedback = right ? q.feedbackCorrect || '' : q.feedbackIncorrect || '';
  return (
    <li className={`review-item ${show.correctness ? `st-${r.status}` : ''}`} data-testid="review-item" data-status={show.correctness ? r.status : undefined}>
      <div className="review-head">
        <span className="qcard-n">{number}</span>
        <span className="review-q">{questionTitle(q)}</span>
        {show.correctness && (
          <span className={`review-badge st-${r.status}`}>
            <Icon size={15} aria-hidden="true" /> {STATUS_LABEL[r.status]} · {r.earned}/{r.max}
          </span>
        )}
      </div>
      <dl className="review-dl">
        <dt>إجابتك</dt>
        <dd data-testid="review-answer">{describeAnswer(q, answer)}</dd>
        {show.correct && r.status !== 'correct' && (
          <>
            <dt>الإجابة الصحيحة</dt>
            <dd data-testid="review-correct">{describeCorrect(q)}</dd>
          </>
        )}
      </dl>
      {show.feedback && (feedback || chosen.length > 0 || (show.notes !== false && r.notes.length > 0) || r.status === 'review') && (
        <div className="review-feedback" data-testid="review-feedback">
          {r.status === 'review' && <p>هذه الإجابة بانتظار مراجعة المعلم، وقد تتغير درجتها.</p>}
          {r.status !== 'review' && feedback && <p>{feedback}</p>}
          {chosen.map((o) => (
            <p key={o.id}>
              <strong>{o.text}:</strong> {o.feedback}
            </p>
          ))}
          {show.notes !== false && r.notes.map((n) => <p key={n} className="muted">{n}</p>)}
        </div>
      )}
      {children}
    </li>
  );
}
