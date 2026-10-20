import { Link } from 'react-router-dom';
import { CheckCircle2, ListChecks, Lock, Play, RotateCcw, Timer } from 'lucide-react';
import { totalPoints } from '../quiz/grading';
import { SCORE_POLICY_LABEL } from '../quiz/model';
import type { MyQuiz } from './data';

const attemptsWord = (n: number) => (n === 1 ? 'محاولة واحدة' : n === 2 ? 'محاولتان' : `${n} محاولات`);

/** A quiz as the student sees it in lists: what it is, where they stand, and the one action that makes sense. */
export function QuizRow({ item, from }: { item: MyQuiz; from?: string }) {
  const { quiz, done, open, counted, limitReached } = item;
  const s = quiz.settings;
  const href = `/take/${quiz.id}${from ? `?from=${encodeURIComponent(from)}` : ''}`;
  let status: string;
  if (open) status = 'محاولة لم تُسلَّم بعد';
  else if (!done.length) status = 'لم تبدأه بعد';
  else if (s.showScore && counted?.result)
    status = `${attemptsWord(done.length)} · ${done.length > 1 ? `المعتمدة (${SCORE_POLICY_LABEL[s.scorePolicy]}): ` : 'نتيجتك: '}${counted.result.percent}٪${counted.result.pendingReview ? ' (مبدئية)' : ''}`;
  else status = `${attemptsWord(done.length)} · سُلّمت`;
  return (
    <li className="student-item" data-testid="student-quiz" data-quiz={quiz.title}>
      <span className="student-item-icon" aria-hidden="true">
        {done.length && !open ? <CheckCircle2 size={20} /> : <ListChecks size={20} />}
      </span>
      <span className="student-item-main">
        <strong>{quiz.title}</strong>
        <span className="muted">
          {quiz.questions.length} {quiz.questions.length === 1 ? 'سؤال' : 'أسئلة'} · {totalPoints(quiz.questions)} درجة
          {s.timeLimit > 0 && (
            <>
              {' · '}
              <Timer size={13} aria-hidden="true" /> {s.timeLimit} دقيقة
            </>
          )}
        </span>
        <span className="student-status" data-testid="student-quiz-status">
          {status}
        </span>
      </span>
      {limitReached ? (
        <span className="pill pill-neutral" data-testid="student-quiz-limit">
          <Lock size={13} aria-hidden="true" /> استُنفدت المحاولات
        </span>
      ) : (
        <Link to={href} className={`btn btn-sm ${done.length && !open ? '' : 'btn-primary'}`} aria-label={`${open ? 'تابع' : done.length ? 'محاولة جديدة' : 'ابدأ'}: ${quiz.title}`} data-testid="student-quiz-go">
          {open ? <Play size={16} aria-hidden="true" /> : done.length ? <RotateCcw size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {open ? 'تابع' : done.length ? 'محاولة جديدة' : 'ابدأ'}
        </Link>
      )}
    </li>
  );
}
