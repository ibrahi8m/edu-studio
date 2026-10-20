import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { db } from '../db/db';
import { DEFAULT_SETTINGS, loadSettings, resetSettings, saveSetting, type Settings } from '../db/settings';
import { requestPersistence } from '../db/storage';

interface SettingsState {
  settings: Settings;
  ready: boolean;
  /** Set when IndexedDB cannot be opened (e.g. blocked storage). */
  storageError: string | null;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  reset: () => Promise<void>;
}

const Ctx = createContext<SettingsState | null>(null);

const THEME_MIRROR = 'ibrahi8m.theme';
/** Same for «تقليل الحركة», so the very first screen after opening already respects it. */
const MOTION_MIRROR = 'ibrahi8m.motion';

function applyToDocument(s: Settings) {
  const root = document.documentElement;
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  const theme = s.theme === 'system' ? (prefersLight ? 'light' : 'dark') : s.theme;
  root.dataset.theme = theme;
  root.style.setProperty('--font-scale', String(s.fontScale));
  root.dataset.motion = s.motion;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#F4F6F9' : '#0E1014');
  try {
    localStorage.setItem(THEME_MIRROR, theme);
    localStorage.setItem(MOTION_MIRROR, s.motion);
  } catch {
    /* storage may be blocked; the DB stays the source of truth */
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await db.open();
        const s = await loadSettings(db);
        if (!alive) return;
        setSettings(s);
        void requestPersistence();
      } catch (e) {
        if (!alive) return;
        setStorageError(
          'تعذّر فتح قاعدة البيانات المحلية في هذا المتصفح. قد يكون التصفح الخاص مفعّلًا أو التخزين محظورًا، ولن تُحفظ التغييرات.',
        );
        console.error(e);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    // Until the saved settings are read, keep the theme painted from the last session;
    // applying the defaults here would flash the dark theme and overwrite that memory.
    if (!ready) return;
    applyToDocument(settings);
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyToDocument(settings);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings, ready]);

  const update = useCallback(async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    if (storageError) return;
    await saveSetting(db, key, value);
  }, [storageError]);

  const reset = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    if (!storageError) await resetSettings(db);
  }, [storageError]);

  const value = useMemo(
    () => ({ settings, ready, storageError, update, reset }),
    [settings, ready, storageError, update, reset],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings outside SettingsProvider');
  return v;
}

/** Paints the last known theme and motion setting before React mounts, to avoid a flash of the wrong ones. */
export function paintMirroredTheme() {
  try {
    const t = localStorage.getItem(THEME_MIRROR);
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    const m = localStorage.getItem(MOTION_MIRROR);
    if (m === 'reduce' || m === 'system') document.documentElement.dataset.motion = m;
  } catch {
    /* ignore */
  }
}
