import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

export function Pill({ tone = 'neutral', icon: Icon, children, testId }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; testId?: string }) {
  return (
    <span className={`pill pill-${tone}`} data-testid={testId}>
      {Icon && <Icon size={14} aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, icon: Icon, children, className = '', testId }: { title?: string; icon?: LucideIcon; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={`card ${className}`} data-testid={testId}>
      {title && (
        <h2 className="card-title">
          {Icon && <Icon size={18} aria-hidden="true" />}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function PhaseBadge({ phase, current }: { phase: number; current: number }) {
  if (phase <= current) return <Pill tone="success">يعمل الآن</Pill>;
  return <Pill tone="neutral">المرحلة {phase}</Pill>;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const Icon = o.icon;
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            className={active ? 'is-active' : ''}
            onClick={() => onChange(o.value)}
          >
            {Icon && <Icon size={16} aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
