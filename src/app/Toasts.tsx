import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, TriangleAlert, X } from 'lucide-react';
import { sfx, type Sfx } from '../audio/engine';
import { useSettings } from './SettingsContext';

interface ToastSpec {
  message: string;
  tone?: 'success' | 'danger';
  action?: { label: string; run: () => void | Promise<void> };
  /** ms; actions get longer so there is time to undo. */
  duration?: number;
  /** 1.2.0: optional interface sound (only if the user turned them on). Errors sound by default. */
  sound?: Sfx | null;
}

interface ToastItem extends ToastSpec {
  id: number;
}

const Ctx = createContext<(t: ToastSpec) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const { settings } = useSettings();
  const prefs = useRef(settings);
  prefs.current = settings;

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback((t: ToastSpec) => {
    const id = ++seq.current;
    const sound = t.sound === undefined ? (t.tone === 'danger' ? 'error' : null) : t.sound;
    if (sound) sfx(sound, prefs.current.sfxOn, prefs.current.sfxVolume, prefs.current.muted);
    // One toast at a time keeps the phone screen clear.
    setItems([{ ...t, id }]);
  }, []);

  const value = useMemo(() => show, [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  useEffect(() => {
    const ms = item.duration ?? (item.action ? 7000 : 3500);
    const t = window.setTimeout(onDone, ms);
    return () => window.clearTimeout(t);
  }, [item, onDone]);
  const Icon = item.tone === 'danger' ? TriangleAlert : CheckCircle2;
  return (
    <div className={`toast toast-${item.tone ?? 'success'}`} role="status" data-testid="toast">
      <Icon size={18} aria-hidden="true" />
      <span>{item.message}</span>
      {item.action && (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={async () => {
            onDone();
            await item.action!.run();
          }}
        >
          {item.action.label}
        </button>
      )}
      <button type="button" className="icon-btn" aria-label="إغلاق التنبيه" onClick={onDone}>
        <X size={18} />
      </button>
    </div>
  );
}

export function useToast() {
  return useContext(Ctx);
}
