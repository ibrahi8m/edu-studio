import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Music, Pause, Play, Plus, Square, Volume2, VolumeX, X } from 'lucide-react';
import { useSettings } from '../app/SettingsContext';
import type { MusicTrack } from '../db/settings';
import { getState, pause, play, resume, setMusicVolume, setMuted, sfx, stop, subscribe, TRACKS, type Sfx } from './engine';

export function useAudio() {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** Plays an interface sound if the user turned them on (settings «مؤثرات الواجهة»). */
export function useSfx() {
  const { settings } = useSettings();
  return useCallback((kind: Sfx) => sfx(kind, settings.sfxOn, settings.sfxVolume, settings.muted), [settings.sfxOn, settings.sfxVolume, settings.muted]);
}

/** Keeps the engine in step with the saved volume and mute (never starts anything by itself). */
export function AudioSync() {
  const { settings } = useSettings();
  useEffect(() => setMusicVolume(settings.musicVolume), [settings.musicVolume]);
  useEffect(() => setMuted(settings.muted), [settings.muted]);
  return null;
}

/** The music transport and the shared controls, used in the «الصوت» popover and in Settings. */
export function SoundControls({ compact = false }: { compact?: boolean }) {
  const { settings, update } = useSettings();
  const a = useAudio();
  const uid = useId();
  if (!a.supported)
    return <p className="muted">هذا المتصفح لا يدعم تشغيل الأصوات المولّدة (Web Audio).</p>;
  const playing = a.transport === 'playing';
  return (
    <div className={`sound-controls ${compact ? 'is-compact' : ''}`} data-testid="sound-controls" data-transport={a.transport}>
      <div className="field">
        <label className="field-label" htmlFor={`${uid}-t`}>
          المسار
        </label>
        <select
          id={`${uid}-t`}
          className="input"
          value={settings.musicTrack}
          onChange={(e) => {
            const t = e.target.value as MusicTrack;
            void update('musicTrack', t);
            if (a.transport !== 'stopped') play(t, settings.musicVolume);
          }}
          data-testid="music-track"
        >
          {TRACKS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} — {t.hint}
            </option>
          ))}
        </select>
      </div>
      <div className="sound-transport">
        {a.transport === 'stopped' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => play(settings.musicTrack, settings.musicVolume)} data-testid="music-play">
            <Play size={16} aria-hidden="true" /> تشغيل الموسيقى
          </button>
        )}
        {playing && (
          <button type="button" className="btn btn-sm" onClick={pause} data-testid="music-pause">
            <Pause size={16} aria-hidden="true" /> إيقاف مؤقت
          </button>
        )}
        {a.transport === 'paused' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={resume} data-testid="music-resume">
            <Play size={16} aria-hidden="true" /> استئناف
          </button>
        )}
        {a.transport !== 'stopped' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={stop} data-testid="music-stop">
            <Square size={14} aria-hidden="true" /> إيقاف
          </button>
        )}
        <span className="muted sound-state" data-testid="music-state">
          {a.transport === 'playing' ? 'تعمل الآن' : a.transport === 'paused' ? 'متوقفة مؤقتًا' : 'متوقفة'}
        </span>
      </div>
      <Slider label="مستوى صوت الموسيقى" value={settings.musicVolume} onChange={(v) => void update('musicVolume', v)} testId="music-volume" />
      <label className="switch-row">
        <input type="checkbox" checked={settings.sfxOn} onChange={(e) => void update('sfxOn', e.target.checked)} data-testid="sfx-toggle" />
        <span>مؤثرات الواجهة (الحفظ، النسخ، التصدير، إنشاء البرومبت، التنبيهات والأخطاء)</span>
      </label>
      {settings.sfxOn && <Slider label="مستوى صوت المؤثرات" value={settings.sfxVolume} onChange={(v) => void update('sfxVolume', v)} testId="sfx-volume" />}
      <label className="switch-row">
        <input type="checkbox" checked={settings.muted} onChange={(e) => void update('muted', e.target.checked)} data-testid="mute-all" />
        <span>كتم جميع الأصوات</span>
      </label>
      {!compact && (
        <p className="field-hint">
          الموسيقى والمؤثرات مولّدة داخل التطبيق (Web Audio)، أصلية وتعمل دون إنترنت ولا تحتاج ملفات. لا يبدأ أي صوت تلقائيًا: يُحفظ اختيارك للمسار والمستوى، ويبقى التشغيل بيدك عند كل فتح.
        </p>
      )}
    </div>
  );
}

/**
 * 1.5.0: the volume control. Left = quieter, right = louder (fixed left-to-right even in the Arabic
 * interface, like the speaker icons around it), drag or tap anywhere on the bar, arrow keys / Home / End,
 * and − / + buttons (10 % steps) for touch screens. Every change goes straight to the sound engine.
 */
function Slider({ label, value, onChange, testId }: { label: string; value: number; onChange: (v: number) => void; testId: string }) {
  const id = useId();
  const pct = Math.round(value * 100);
  const setPct = (p: number) => onChange(Math.max(0, Math.min(100, Math.round(p))) / 100);
  return (
    <div className="field slider-field volume-field">
      <label className="field-label" htmlFor={id}>
        {label}: <span dir="ltr" data-testid={`${testId}-value`}>{pct}٪</span>
      </label>
      <div className="volume-row" dir="ltr">
        <button type="button" className="icon-btn" aria-label={`خفض ${label}`} onClick={() => setPct(pct - 10)} disabled={pct <= 0} data-testid={`${testId}-down`}>
          <Minus size={16} aria-hidden="true" />
        </button>
        <VolumeX size={16} aria-hidden="true" className="volume-ico" />
        <input
          id={id}
          type="range"
          dir="ltr"
          min={0}
          max={100}
          step={1}
          value={pct}
          aria-valuetext={`${pct}٪`}
          onChange={(e) => setPct(Number(e.target.value))}
          style={{ '--fill': `${pct}%` } as CSSProperties}
          data-testid={testId}
        />
        <Volume2 size={16} aria-hidden="true" className="volume-ico" />
        <button type="button" className="icon-btn" aria-label={`رفع ${label}`} onClick={() => setPct(pct + 10)} disabled={pct >= 100} data-testid={`${testId}-up`}>
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** A small «الصوت» button for the top bar / sidebar, opening the controls in a popover. */
export function SoundButton({ className = '' }: { className?: string }) {
  const { settings, update } = useSettings();
  const a = useAudio();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // The popover is rendered at the end of <body> (top bars use backdrop blur, which would clip it),
  // placed under its button on wide screens and as a bottom sheet on phones (CSS).
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const place = () => {
      const r = box.current!.getBoundingClientRect();
      const w = Math.min(340, window.innerWidth - 24);
      setPos({ top: r.bottom + 8, left: Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12)) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || pop.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const Icon = settings.muted ? VolumeX : a.transport === 'playing' ? Music : Volume2;
  return (
    <div className={`sound-btn-wrap ${className}`} ref={box}>
      <button
        type="button"
        className={`icon-btn sound-btn ${a.transport === 'playing' ? 'is-playing' : ''}`}
        aria-label={`الصوت${a.transport === 'playing' ? ': الموسيقى تعمل' : ''}${settings.muted ? ': مكتوم' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="sound-button"
      >
        <Icon size={19} />
      </button>
      {open &&
        createPortal(
        <div ref={pop} className="sound-pop" role="dialog" aria-label="الصوت" data-testid="sound-popover" style={pos ? { top: pos.top, left: pos.left } : undefined}>
          <div className="sound-pop-head">
            <strong>الصوت</strong>
            <button type="button" className="icon-btn" aria-label={settings.muted ? 'إلغاء الكتم' : 'كتم كل الأصوات'} onClick={() => void update('muted', !settings.muted)} data-testid="quick-mute">
              {settings.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button type="button" className="icon-btn" aria-label="إغلاق" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <SoundControls compact />
        </div>,
          document.body,
        )}
    </div>
  );
}
