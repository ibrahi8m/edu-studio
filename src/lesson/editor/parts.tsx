import { forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Check, CircleAlert, CloudOff, LoaderCircle, Pencil } from 'lucide-react';
import type { Option } from '../catalog';
import type { SaveState } from '../useLessonEditor';

/** Textarea that grows with its content (comfortable on phones, no inner scrollbars). */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }>(function AutoTextarea(
  { minRows = 2, className = '', ...props },
  outer,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(outer, () => ref.current as HTMLTextAreaElement);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useLayoutEffect(fit, [props.value]);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return <textarea ref={ref} rows={minRows} className={`input textarea auto-ta ${className}`} {...props} />;
});

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  hint,
  maxLength = 500,
  testId,
  minRows,
  inputMode,
  dir,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  hint?: ReactNode;
  maxLength?: number;
  testId?: string;
  minRows?: number;
  inputMode?: 'numeric' | 'text';
  dir?: 'auto' | 'rtl' | 'ltr';
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <AutoTextarea id={id} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} data-testid={testId} minRows={minRows} dir={dir} />
      ) : (
        <input id={id} className="input" value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} data-testid={testId} inputMode={inputMode} dir={dir} />
      )}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

/** Multi-select as a row of toggle chips (large touch targets). */
export function ChipGroup({ label, options, value, onChange, testId }: { label: string; options: Option[]; value: string[]; onChange: (v: string[]) => void; testId?: string }) {
  return (
    <div className="chip-group" role="group" aria-label={label} data-testid={testId}>
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            className={`chip ${on ? 'is-on' : ''}`}
            aria-pressed={on}
            title={o.hint}
            onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
          >
            {on && <Check size={14} aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SaveStatusPill({ status, onRetry }: { status: SaveState; onRetry?: () => void }) {
  const time = (t: number | null) => (t ? new Date(t).toLocaleTimeString('ar', { hour: 'numeric', minute: '2-digit' }) : '');
  switch (status.kind) {
    case 'loading':
      return null;
    case 'missing':
      return null;
    case 'saved':
      return (
        <span className="save-pill is-saved" role="status" data-testid="save-status" data-state="saved">
          <Check size={15} aria-hidden="true" /> {status.at ? `تم الحفظ ${time(status.at)}` : 'محفوظ على الجهاز'}
        </span>
      );
    case 'dirty':
      return (
        <span className="save-pill is-dirty" role="status" data-testid="save-status" data-state="dirty">
          <Pencil size={14} aria-hidden="true" /> تغييرات لم تُحفظ بعد
        </span>
      );
    case 'saving':
      return (
        <span className="save-pill is-saving" role="status" data-testid="save-status" data-state="saving">
          <LoaderCircle size={15} className="spin" aria-hidden="true" /> جارٍ الحفظ…
        </span>
      );
    case 'invalid':
      return (
        <span className="save-pill is-error" role="alert" data-testid="save-status" data-state="invalid">
          <CircleAlert size={15} aria-hidden="true" /> لم يُحفظ: {status.message}
        </span>
      );
    case 'conflict':
      return (
        <span className="save-pill is-error" role="alert" data-testid="save-status" data-state="conflict">
          <CircleAlert size={15} aria-hidden="true" /> الحفظ متوقف
        </span>
      );
    case 'error':
      return (
        <span className="save-pill is-error" role="alert" data-testid="save-status" data-state="error">
          <CloudOff size={15} aria-hidden="true" /> تعذّر الحفظ
          {onRetry && (
            <button type="button" className="link-btn" onClick={onRetry}>
              إعادة المحاولة
            </button>
          )}
        </span>
      );
  }
}

export function SectionCard({ title, icon, children, actions, testId, id }: { title: string; icon?: ReactNode; children: ReactNode; actions?: ReactNode; testId?: string; id?: string }) {
  return (
    <section className="card ed-section" data-testid={testId} id={id}>
      <div className="ed-section-head">
        <h2 className="card-title">
          {icon}
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
