const BASE = import.meta.env.BASE_URL;

export const ASSETS = {
  mark: `${BASE}brand/robot-mark.svg`,
  portrait: `${BASE}brand/ibrahim-portrait.webp`,
  avatar: `${BASE}brand/ibrahim-avatar.webp`,
};

export function BrandMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={ASSETS.mark}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={`brand-mark ${className}`}
      draggable={false}
    />
  );
}

/** Typographic wordmark: the 8 carries the electric-blue accent. */
export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return (
    <span className={`wordmark wordmark-${size}`} dir="ltr" aria-label="IBRAHI8M">
      IBRAHI<span className="wordmark-eight">8</span>M
    </span>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-lockup">
      <BrandMark size={compact ? 32 : 38} />
      <span className="brand-lockup-text">
        <Wordmark size="sm" />
        {!compact && <span className="brand-sub" dir="ltr">EDU STUDIO</span>}
      </span>
    </span>
  );
}

/**
 * The owner's real photo (cropped only, never retouched) inside the tech frame.
 */
export function Portrait({
  variant,
  alt = 'صورة صاحب المشروع',
}: {
  variant: 'hero' | 'card' | 'avatar';
  alt?: string;
}) {
  if (variant === 'avatar') {
    return (
      <span className="portrait-avatar">
        <img src={ASSETS.avatar} alt={alt} width={160} height={160} draggable={false} />
      </span>
    );
  }
  return (
    <figure className={`portrait-frame portrait-${variant}`}>
      <span className="pf-corner pf-tl" aria-hidden="true" />
      <span className="pf-corner pf-tr" aria-hidden="true" />
      <span className="pf-corner pf-bl" aria-hidden="true" />
      <span className="pf-corner pf-br" aria-hidden="true" />
      <span className="pf-scan" aria-hidden="true" />
      <img src={ASSETS.portrait} alt={alt} width={720} height={900} draggable={false} />
    </figure>
  );
}
