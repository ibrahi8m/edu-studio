import { useEffect, useRef } from 'react';
import { Portrait, Wordmark } from './Brand';

const DURATION = 1800;

export function Splash({ onDone, ownerName }: { onDone: () => void; ownerName: string }) {
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const t = window.setTimeout(onDone, DURATION);
    btn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [onDone]);

  return (
    <div className="splash" role="dialog" aria-modal="true" aria-label="شاشة البداية" data-testid="splash">
      <div className="splash-grid" aria-hidden="true" />
      <div className="splash-inner">
        <Portrait variant="hero" alt={`صورة ${ownerName}، صاحب المشروع`} />
        <div className="splash-brand">
          <Wordmark size="xl" />
          <span className="splash-product" dir="ltr">EDU STUDIO</span>
          <span className="splash-slogan" dir="ltr">Create. Teach. Inspire.</span>
          <span className="splash-ar">استوديو تصميم المحتوى التعليمي الرقمي</span>
          <span className="splash-progress" aria-hidden="true">
            <span style={{ animationDuration: `${DURATION}ms` }} />
          </span>
        </div>
      </div>
      <button ref={btn} type="button" className="splash-skip" onClick={onDone}>
        تخطي
      </button>
    </div>
  );
}
