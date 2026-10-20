const BASE = import.meta.env.BASE_URL;

export const ASSETS = {
  /** App icon: the figure-8 robot on its charcoal tile (final logo, phase 7). */
  mark: `${BASE}brand/ibrahi8m-mark.svg`,
  /** The same mark without the tile, for large use on any background. */
  glyph: `${BASE}brand/ibrahi8m-glyph.svg`,
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

/** Large mark without the tile (splash, about page). */
export function BrandGlyph({ height = 120, className = '' }: { height?: number; className?: string }) {
  return <img src={ASSETS.glyph} height={height} width={Math.round((height * 320) / 470)} alt="" aria-hidden="true" className={`brand-glyph ${className}`} draggable={false} />;
}

/**
 * The 8 of the wordmark, drawn like the mark: upper loop = the robot head with two eyes,
 * lower loop = the circuit ring in electric blue. Sized in em so it follows the text.
 */
export function Eight() {
  return (
    <svg className="wordmark-eight" viewBox="0 0 56 84" aria-hidden="true" focusable="false">
      <circle className="w8-head" cx="28" cy="22" r="15" />
      <circle className="w8-eye" cx="23" cy="22" r="3.2" />
      <circle className="w8-eye" cx="33" cy="22" r="3.2" />
      <circle className="w8-loop" cx="28" cy="60" r="18" />
      <circle className="w8-eye" cx="28" cy="39.5" r="3.4" />
    </svg>
  );
}

/** Wordmark: IBRAHI + the figure-8 robot + M. Read aloud as one word. */
export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return (
    <span className={`wordmark wordmark-${size}`} dir="ltr" role="img" aria-label="IBRAHI8M">
      <span aria-hidden="true">IBRAHI</span>
      <Eight />
      <span aria-hidden="true">M</span>
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
