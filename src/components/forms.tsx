import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import type { ContentKind, ItemStatus, Lesson, Project, ProjectColor } from '../db/db';
import { CONTENT_KINDS, KIND_SPECS, kindOf } from '../db/contentKinds';
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

function StatusSelect({ id, value, onChange, testId }: { id: string; value: ItemStatus; onChange: (v: ItemStatus) => void; testId?: string }) {
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as ItemStatus)} data-testid={testId}>
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
  const setDetail = (k: string, val: string) => setV((p) => ({ ...p, details: { ...(p.details ?? {}), [k]: val } }));
  const suggestions = [...new Set([...subjects, ...SUBJECT_SUGGESTIONS])];
  const kind: ContentKind = v.kind ?? 'school';
  const spec = KIND_SPECS[kind];

  return (
    <Dialog
      open={open}
      title={initial ? 'تعديل المحتوى التعليمي' : 'إضافة محتوى تعليمي جديد'}
      onClose={onClose}
      testId="project-dialog"
      onSubmit={async () => {
        const k = v.kind ?? 'school';
        // A school grade is kept only for school content; the other kinds store their fixed stage.
        const fixed = CONTENT_KINDS.map((x) => KIND_SPECS[x].fixedGrade);
        const grade = KIND_SPECS[k].usesGrade ? (fixed.includes(v.grade) ? '' : v.grade) : KIND_SPECS[k].fixedGrade;
        const input: ProjectInput = { ...v, tags: v.tagsText, grade };
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
            {initial ? 'حفظ التعديلات' : 'إضافة المحتوى'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <fieldset className="kind-field">
          <legend className="field-label">نوع المحتوى</legend>
          <div className="kind-options" role="radiogroup" aria-label="نوع المحتوى">
            {CONTENT_KINDS.map((k) => (
              <label key={k} className={`kind-option ${kind === k ? 'is-active' : ''}`} data-testid={`content-kind-${k}`}>
                <input type="radio" name={`${uid}-kind`} value={k} checked={kind === k} onChange={() => set('kind', k)} />
                <strong>{KIND_SPECS[k].label}</strong>
                <span>{KIND_SPECS[k].hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={spec.titleLabel} htmlFor={`${uid}-t`} error={errors.title} required>
          <input
            ref={titleRef}
            id={`${uid}-t`}
            className="input"
            value={v.title}
            maxLength={LIMITS.title}
            placeholder={kind === 'school' ? 'مثال: وحدة الطاقة ومصادرها' : kind === 'university' ? 'مثال: تصميم المحتوى الرقمي' : 'مثال: التعلم النشط في الصف'}
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? `${uid}-t-err` : undefined}
            onChange={(e) => set('title', e.target.value)}
            data-testid="project-title"
          />
        </Field>
        <div className="form-row">
          <Field label={spec.subjectLabel} htmlFor={`${uid}-s`} error={errors.subject}>
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
          {spec.usesGrade && (
            <Field label="الصف" htmlFor={`${uid}-g`} error={errors.grade}>
              <select id={`${uid}-g`} className="input" value={v.grade} onChange={(e) => set('grade', e.target.value)} data-testid="project-grade">
                <option value="">غير محدد</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <div className="form-row kind-details">
          {spec.fields
            .filter((f) => !f.multiline)
            .map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`${uid}-k-${f.key}`}>
                {f.options ? (
                  <select id={`${uid}-k-${f.key}`} className="input" value={v.details?.[f.key] ?? ''} onChange={(e) => setDetail(f.key, e.target.value)} data-testid={`detail-${f.key}`}>
                    <option value="">غير محدد</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input id={`${uid}-k-${f.key}`} className="input" value={v.details?.[f.key] ?? ''} maxLength={f.max} placeholder={f.placeholder} onChange={(e) => setDetail(f.key, e.target.value)} data-testid={`detail-${f.key}`} />
                )}
              </Field>
            ))}
        </div>
        {spec.fields
          .filter((f) => f.multiline)
          .map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`${uid}-k-${f.key}`} hint={f.placeholder}>
              <textarea id={`${uid}-k-${f.key}`} className="input textarea" rows={3} maxLength={f.max} value={v.details?.[f.key] ?? ''} onChange={(e) => setDetail(f.key, e.target.value)} data-testid={`detail-${f.key}`} />
            </Field>
          ))}
        <Field label="الوصف" htmlFor={`${uid}-d`} error={errors.description} hint="الفكرة العامة أو أي ملاحظة. الملفات والوسائط تُضاف داخل الدروس (صورة، صوت، فيديو، ملف مرفق).">
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
          <Field label="مرحلة الإعداد" htmlFor={`${uid}-st`}>
            <StatusSelect id={`${uid}-st`} value={v.status ?? 'draft'} onChange={(x) => set('status', x)} testId="project-status" />
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
        <label className="switch-row">
          <input type="checkbox" checked={v.published !== false} onChange={(e) => set('published', e.target.checked)} data-testid="project-published" />
          <span>
            <strong>{v.published !== false ? 'منشور' : 'مسودة غير منشورة'}</strong> — {v.published !== false ? 'يظهر في بيئة المتعلم على هذا الجهاز.' : 'لا يظهر للمتعلمين حتى تنشره.'}
          </span>
        </label>
        <fieldset className="color-field">
          <legend className="field-label">لون البطاقة</legend>
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
    kind: p ? kindOf(p) : 'school',
    published: p ? p.published !== false : true,
    details: { ...(p?.details ?? {}) },
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
  unitLabel = 'الوحدة',
  lessonLabel = 'الدرس',
  units = [],
}: {
  open: boolean;
  initial?: Lesson | null;
  projectTitle: string;
  onClose: () => void;
  onSave: (input: LessonInput) => Promise<void>;
  onDelete?: () => void;
  /** Label of the grouping for the project's kind (الوحدة / المحور …) and the names already used. */
  unitLabel?: string;
  lessonLabel?: string;
  units?: string[];
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
        const input: LessonInput = { title: v.title, summary: v.summary, status: v.status, tags: v.tagsText, duration, unit: v.unit };
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
      <p className="muted dialog-context">ضمن: {projectTitle}</p>
      <div className="form-grid">
        <Field label={`${unitLabel} (اختياري)`} htmlFor={`${uid}-u`} hint={`الدروس التي تحمل الاسم نفسه تُجمع تحت ${unitLabel} واحدة.`}>
          <input id={`${uid}-u`} className="input" list={`${uid}-units`} value={v.unit} maxLength={LIMITS.title} placeholder="مثال: الوحدة الأولى" onChange={(e) => set('unit', e.target.value)} data-testid="lesson-unit" />
          <datalist id={`${uid}-units`}>
            {units.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>
        <Field label={`عنوان ${lessonLabel}`} htmlFor={`${uid}-t`} error={errors.title} required>
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
            <StatusSelect id={`${uid}-st`} value={v.status} onChange={(x) => set('status', x)} testId="lesson-status" />
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
    unit: l?.unit ?? '',
  };
}
