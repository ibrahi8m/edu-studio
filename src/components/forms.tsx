import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import type { ItemStatus, Lesson, Project, ProjectColor } from '../db/db';
import { GRADES, LIMITS, PROJECT_COLORS, STATUSES, STATUS_LABEL, SUBJECT_SUGGESTIONS } from '../db/catalog';
import { validateLesson, validateProject, type FieldErrors, type LessonInput, type ProjectInput } from '../db/projects';
import { Dialog } from './Dialog';

function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
  required,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  htmlFor: string;
  required?: boolean;
}) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="req" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error ? (
        <span className="field-error" id={`${htmlFor}-err`} role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </div>
  );
}

function StatusSelect({ id, value, onChange }: { id: string; value: ItemStatus; onChange: (v: ItemStatus) => void }) {
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as ItemStatus)}>
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

/* ───────── Project ───────── */

export function ProjectFormDialog({
  open,
  initial,
  subjects,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: Project | null;
  subjects: string[];
  onClose: () => void;
  onSave: (input: ProjectInput) => Promise<void>;
}) {
  const uid = useId();
  const [v, setV] = useState<ProjectInput & { tagsText: string }>(blankProject(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setV(blankProject(initial));
      setErrors({});
      setSaving(false);
      window.setTimeout(() => titleRef.current?.focus(), 30);
    }
  }, [open, initial]);

  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const suggestions = [...new Set([...subjects, ...SUBJECT_SUGGESTIONS])];

  return (
    <Dialog
      open={open}
      title={initial ? 'تعديل المشروع' : 'مشروع جديد'}
      onClose={onClose}
      testId="project-dialog"
      onSubmit={async () => {
        const input: ProjectInput = { ...v, tags: v.tagsText };
        const e = validateProject(input);
        setErrors(e);
        if (Object.keys(e).length) {
          titleRef.current?.focus();
          return;
        }
        setSaving(true);
        try {
          await onSave(input);
        } finally {
          setSaving(false);
        }
      }}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving} data-testid="project-save">
            {initial ? 'حفظ التعديلات' : 'إنشاء المشروع'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="عنوان المشروع" htmlFor={`${uid}-t`} error={errors.title} required>
          <input
            ref={titleRef}
            id={`${uid}-t`}
            className="input"
            value={v.title}
            maxLength={LIMITS.title}
            placeholder="مثال: وحدة الطاقة ومصادرها"
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? `${uid}-t-err` : undefined}
            onChange={(e) => set('title', e.target.value)}
            data-testid="project-title"
          />
        </Field>
        <div className="form-row">
          <Field label="المادة" htmlFor={`${uid}-s`} error={errors.subject}>
            <input
              id={`${uid}-s`}
              className="input"
              list={`${uid}-subjects`}
              value={v.subject}
              maxLength={LIMITS.subject}
              placeholder="اختر أو اكتب"
              onChange={(e) => set('subject', e.target.value)}
              data-testid="project-subject"
            />
            <datalist id={`${uid}-subjects`}>
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="المرحلة الدراسية" htmlFor={`${uid}-g`} error={errors.grade}>
            <select id={`${uid}-g`} className="input" value={v.grade} onChange={(e) => set('grade', e.target.value)} data-testid="project-grade">
              <option value="">غير محددة</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="وصف مختصر" htmlFor={`${uid}-d`} error={errors.description} hint="الفئة المستهدفة، الفكرة العامة، أو أي ملاحظة.">
          <textarea
            id={`${uid}-d`}
            className="input textarea"
            rows={3}
            maxLength={LIMITS.description}
            value={v.description}
            onChange={(e) => set('description', e.target.value)}
            data-testid="project-description"
          />
        </Field>
        <div className="form-row">
          <Field label="الحالة" htmlFor={`${uid}-st`}>
            <StatusSelect id={`${uid}-st`} value={v.status ?? 'draft'} onChange={(x) => set('status', x)} />
          </Field>
          <Field label="الوسوم" htmlFor={`${uid}-tg`} hint="افصل بينها بفاصلة.">
            <input
              id={`${uid}-tg`}
              className="input"
              value={v.tagsText}
              placeholder="مثال: طاقة، تجارب"
              onChange={(e) => set('tagsText', e.target.value)}
              data-testid="project-tags"
            />
          </Field>
        </div>
        <fieldset className="color-field">
          <legend className="field-label">لون المشروع</legend>
          <div className="color-options">
            {PROJECT_COLORS.map((c) => (
              <label key={c.value} className={`color-swatch c-${c.value}`} title={c.label}>
                <input
                  type="radio"
                  name={`${uid}-color`}
                  value={c.value}
                  checked={v.color === c.value}
                  onChange={() => set('color', c.value as ProjectColor)}
                />
                <span className="sr-only">{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

function blankProject(p?: Project | null): ProjectInput & { tagsText: string } {
  return {
    title: p?.title ?? '',
    subject: p?.subject ?? '',
    grade: p?.grade ?? '',
    description: p?.description ?? '',
    status: p?.status ?? 'draft',
    color: p?.color ?? 'blue',
    tags: p?.tags ?? [],
    tagsText: (p?.tags ?? []).join('، '),
  };
}

/* ───────── Lesson ───────── */

export function LessonFormDialog({
  open,
  initial,
  projectTitle,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  initial?: Lesson | null;
  projectTitle: string;
  onClose: () => void;
  onSave: (input: LessonInput) => Promise<void>;
  onDelete?: () => void;
}) {
  const uid = useId();
  const [v, setV] = useState(blankLesson(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setV(blankLesson(initial));
      setErrors({});
      setSaving(false);
      window.setTimeout(() => titleRef.current?.focus(), 30);
    }
  }, [open, initial]);

  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  return (
    <Dialog
      open={open}
      title={initial ? 'تعديل الدرس' : 'درس جديد'}
      onClose={onClose}
      testId="lesson-dialog"
      onSubmit={async () => {
        const duration = v.durationText.trim() === '' ? 0 : Number(v.durationText.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
        const input: LessonInput = { title: v.title, summary: v.summary, status: v.status, tags: v.tagsText, duration };
        const e = validateLesson(input);
        setErrors(e);
        if (Object.keys(e).length) return;
        setSaving(true);
        try {
          await onSave(input);
        } finally {
          setSaving(false);
        }
      }}
      footer={
        <>
          {initial && onDelete && (
            <button type="button" className="btn btn-danger-ghost foot-start" onClick={onDelete} data-testid="lesson-delete">
              <Trash2 size={16} aria-hidden="true" /> حذف الدرس
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving} data-testid="lesson-save">
            {initial ? 'حفظ التعديلات' : 'إضافة الدرس'}
          </button>
        </>
      }
    >
      <p className="muted dialog-context">ضمن مشروع: {projectTitle}</p>
      <div className="form-grid">
        <Field label="عنوان الدرس" htmlFor={`${uid}-t`} error={errors.title} required>
          <input
            ref={titleRef}
            id={`${uid}-t`}
            className="input"
            value={v.title}
            maxLength={LIMITS.title}
            placeholder="مثال: مصادر الطاقة المتجددة"
            aria-invalid={!!errors.title}
            onChange={(e) => set('title', e.target.value)}
            data-testid="lesson-title"
          />
        </Field>
        <Field label="ملخص الدرس" htmlFor={`${uid}-s`} error={errors.summary} hint="الأهداف والمحتوى التفصيلي تُبنى في محرر الدرس.">
          <textarea
            id={`${uid}-s`}
            className="input textarea"
            rows={3}
            maxLength={LIMITS.summary}
            value={v.summary}
            onChange={(e) => set('summary', e.target.value)}
            data-testid="lesson-summary"
          />
        </Field>
        <div className="form-row form-row-3">
          <Field label="المدة (دقيقة)" htmlFor={`${uid}-d`} error={errors.duration}>
            <input
              id={`${uid}-d`}
              className="input"
              inputMode="numeric"
              value={v.durationText}
              placeholder="45"
              onChange={(e) => set('durationText', e.target.value)}
              data-testid="lesson-duration"
            />
          </Field>
          <Field label="الحالة" htmlFor={`${uid}-st`}>
            <StatusSelect id={`${uid}-st`} value={v.status} onChange={(x) => set('status', x)} />
          </Field>
          <Field label="الوسوم" htmlFor={`${uid}-tg`}>
            <input id={`${uid}-tg`} className="input" value={v.tagsText} onChange={(e) => set('tagsText', e.target.value)} data-testid="lesson-tags" />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function blankLesson(l?: Lesson | null) {
  return {
    title: l?.title ?? '',
    summary: l?.summary ?? '',
    durationText: l?.duration ? String(l.duration) : '',
    status: (l?.status ?? 'draft') as ItemStatus,
    tagsText: (l?.tags ?? []).join('، '),
  };
}
