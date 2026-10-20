import { useEffect, useId, useMemo, useState } from 'react';
import { Dialog } from '../components/Dialog';
import type { Lesson, Project } from '../db/db';
import { LIMITS } from './model';

/** New quiz: title, project (required) and optional lesson. */
export function CreateQuizDialog({
  open,
  projects,
  lessons,
  initialProjectId,
  initialLessonId,
  onClose,
  onCreate,
}: {
  open: boolean;
  projects: Project[];
  lessons: Lesson[];
  initialProjectId?: string;
  initialLessonId?: string | null;
  onClose: () => void;
  onCreate: (v: { title: string; projectId: string; lessonId: string | null }) => Promise<void>;
}) {
  const uid = useId();
  const active = projects.filter((p) => p.status !== 'archived');
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [errors, setErrors] = useState<{ title?: string; project?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setProjectId(initialProjectId ?? (active.length === 1 ? active[0].id : ''));
    setLessonId(initialLessonId ?? '');
    setErrors({});
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const projectLessons = useMemo(() => lessons.filter((l) => l.projectId === projectId).sort((a, b) => a.order - b.order), [lessons, projectId]);

  return (
    <Dialog
      open={open}
      title="اختبار جديد"
      onClose={onClose}
      testId="create-quiz-dialog"
      onSubmit={async () => {
        const e: typeof errors = {};
        if (!title.trim()) e.title = 'عنوان الاختبار مطلوب.';
        if (!projectId) e.project = 'اختر المشروع.';
        setErrors(e);
        if (Object.keys(e).length) return;
        setBusy(true);
        try {
          await onCreate({ title, projectId, lessonId: lessonId || null });
        } finally {
          setBusy(false);
        }
      }}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="create-quiz-save">
            إنشاء الاختبار
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className={`field ${errors.title ? 'has-error' : ''}`}>
          <label className="field-label" htmlFor={`${uid}-t`}>
            عنوان الاختبار <span className="req" aria-hidden="true">*</span>
          </label>
          <input
            id={`${uid}-t`}
            className="input"
            value={title}
            maxLength={LIMITS.title}
            placeholder="مثال: اختبار قصير — مصادر الطاقة"
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={!!errors.title}
            data-testid="quiz-title-input"
            autoFocus
          />
          {errors.title && (
            <span className="field-error" role="alert">
              {errors.title}
            </span>
          )}
        </div>
        <div className={`field ${errors.project ? 'has-error' : ''}`}>
          <label className="field-label" htmlFor={`${uid}-p`}>
            المشروع <span className="req" aria-hidden="true">*</span>
          </label>
          <select
            id={`${uid}-p`}
            className="input"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setLessonId('');
            }}
            data-testid="quiz-project-select"
          >
            <option value="">اختر مشروعًا</option>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          {errors.project && (
            <span className="field-error" role="alert">
              {errors.project}
            </span>
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-l`}>
            الدرس المرتبط (اختياري)
          </label>
          <select id={`${uid}-l`} className="input" value={lessonId} onChange={(e) => setLessonId(e.target.value)} disabled={!projectId} data-testid="quiz-lesson-select">
            <option value="">كل دروس المشروع</option>
            {projectLessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
          <span className="field-hint">تُعرض أهداف هذا الدرس لربطها بالأسئلة. بدون درس تُعرض أهداف كل دروس المشروع.</span>
        </div>
      </div>
    </Dialog>
  );
}
