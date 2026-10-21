import { useEffect, useId, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardCheck } from 'lucide-react';
import { errorMessage } from '../app/data';
import { useToast } from '../app/Toasts';
import { Dialog } from '../components/Dialog';
import { Pill } from '../components/ui';
import { db } from '../db/db';
import { gradeSubmission, SUBMISSION_LIMITS } from './db';
import { FileList, STATE_TONE } from './AssignmentPanel';
import { ASSIGNMENT_STATE_LABEL, type Submission } from './types';

const when = (t: number | null) => (t ? new Date(t).toLocaleString('ar', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

/** Teacher side: assignments handed in on this device, to read and evaluate. Drafts are the learner's and are not listed. */
export function SubmissionsPanel() {
  const rows = useLiveQuery(async () => {
    const subs = (await db.submissions.toArray()).filter((s) => s.status !== 'draft');
    const lessons = await db.lessons.bulkGet([...new Set(subs.map((s) => s.lessonId))]);
    const titles = new Map(lessons.filter(Boolean).map((l) => [l!.id, l!.title]));
    return subs.map((s) => ({ s, lesson: titles.get(s.lessonId) ?? 'درس محذوف' })).sort((a, b) => (a.s.status === b.s.status ? (b.s.submittedAt ?? 0) - (a.s.submittedAt ?? 0) : a.s.status === 'submitted' ? -1 : 1));
  }, []);
  const [open, setOpen] = useState<Submission | null>(null);
  if (!rows) return null;
  const waiting = rows.filter((r) => r.s.status === 'submitted').length;
  return (
    <section className="card" data-testid="results-submissions">
      <h2 className="card-title">
        <ClipboardCheck size={18} aria-hidden="true" /> التكاليف المسلّمة ({rows.length})
      </h2>
      <p className="muted">
        ما سلّمه المتعلمون على هذا الجهاز (أو وصل بملف نسخة احتياطية). {waiting > 0 ? `${waiting} بانتظار التقييم.` : ''} المسودات غير المسلّمة لا تظهر هنا.
      </p>
      {rows.length === 0 ? (
        <p className="muted" data-testid="submissions-none">
          لم يُسلَّم أي تكليف بعد. فعّل «تكليف يُسلَّم» في نشاط داخل محرر الدرس.
        </p>
      ) : (
        <ul className="attempt-list">
          {rows.map(({ s, lesson }) => (
            <li key={s.id} className="attempt-row" data-testid="submission-row">
              <button type="button" className="attempt-main link-like" onClick={() => setOpen(s)} data-testid="submission-open">
                <strong>{s.studentName}</strong>
                <span className="muted">
                  {s.title} · {lesson} · سُلّم {when(s.submittedAt)}
                  {s.files.length ? ` · ${s.files.length} ملف` : ''}
                </span>
              </button>
              <Pill tone={STATE_TONE[s.status]}>{s.status === 'graded' && s.score !== null ? `${s.score}/100` : ASSIGNMENT_STATE_LABEL[s.status]}</Pill>
            </li>
          ))}
        </ul>
      )}
      <GradeDialog sub={open} onClose={() => setOpen(null)} />
    </section>
  );
}

function GradeDialog({ sub, onClose }: { sub: Submission | null; onClose: () => void }) {
  const toast = useToast();
  const uid = useId();
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!sub) return;
    setScore(sub.score === null ? '' : String(sub.score));
    setFeedback(sub.feedback);
    setError('');
  }, [sub]);
  return (
    <Dialog
      open={!!sub}
      title={sub ? `تكليف: ${sub.title}` : ''}
      onClose={onClose}
      size="lg"
      testId="grade-dialog"
      onSubmit={async () => {
        if (!sub) return;
        const raw = score.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).trim();
        const n = raw === '' ? null : Number(raw);
        if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100)) {
          setError('الدرجة رقم بين 0 و100، أو اتركها فارغة.');
          return;
        }
        try {
          const g = await gradeSubmission(db, sub.id, n, feedback);
          onClose();
          toast({ message: g.status === 'graded' ? `حُفظ تقييم ${sub.studentName}.` : 'أُزيل التقييم.' });
        } catch (e) {
          toast({ message: errorMessage(e), tone: 'danger' });
        }
      }}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إغلاق
          </button>
          <button type="submit" className="btn btn-primary" data-testid="grade-save">
            حفظ التقييم
          </button>
        </>
      }
    >
      {sub && (
        <div className="form-grid">
          <p className="muted">
            {sub.studentName} · سُلّم {when(sub.submittedAt)}
          </p>
          <div className="field">
            <span className="field-label">إجابة المتعلم</span>
            <p className="pre grade-answer" data-testid="grade-answer">
              {sub.answer || <span className="muted">(بلا نص)</span>}
            </p>
            <FileList files={sub.files} />
          </div>
          <div className={`field ${error ? 'has-error' : ''}`}>
            <label className="field-label" htmlFor={`${uid}-s`}>
              الدرجة من 100 (اختيارية)
            </label>
            <input id={`${uid}-s`} className="input" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} data-testid="grade-score" />
            {error && (
              <span className="field-error" role="alert">
                {error}
              </span>
            )}
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-f`}>
              التغذية الراجعة للمتعلم
            </label>
            <textarea id={`${uid}-f`} className="input textarea" rows={4} maxLength={SUBMISSION_LIMITS.feedback} value={feedback} onChange={(e) => setFeedback(e.target.value)} data-testid="grade-feedback" />
            <span className="field-hint">يراها المتعلم في الدرس وفي «تقدمي» على هذا الجهاز.</span>
          </div>
        </div>
      )}
    </Dialog>
  );
}
