import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings } from './SettingsContext';
import type { BackgroundKind, MotionLevel } from '../db/settings';

/**
 * 1.2.0 — the animated background: one <canvas> fixed behind the whole app (z-index 0,
 * pointer-events none, aria-hidden), drawn with the brand colours. No library, no video.
 *
 *  - Strength depends on the page: livelier on the dashboard and AI Design Studio, quieter where
 *    people read or write (content, learner environment, lesson editor, CV), none while taking a quiz.
 *  - «حركة هادئة» draws at ~30 fps and slower; «خلفية ثابتة» draws one frame; «إيقاف» draws nothing.
 *  - The system «reduce motion» setting turns any movement into a still frame.
 *  - Paused while the tab is hidden; fewer particles and a lower pixel ratio on phones and small CPUs.
 */

type Zone = 'feature' | 'quiet' | 'focus' | 'tech' | 'none';

export function zoneFor(path: string): Zone {
  if (path.startsWith('/take/') || path.startsWith('/preview/')) return 'none';
  if (path === '/' ) return 'feature';
  if (path.startsWith('/ai-studio')) return 'tech';
  if (/^\/projects\/[^/]+\/lessons\//.test(path) || path.startsWith('/studio/') || path.startsWith('/quizzes/')) return 'focus';
  return 'quiet';
}

const STRENGTH: Record<Zone, number> = { feature: 1, tech: 1, quiet: 0.55, focus: 0.3, none: 0 };

interface Palette {
  bg: [string, string];
  glow: string;
  glow2: string;
  dot: string;
  line: string;
}

function palette(theme: string): Palette {
  return theme === 'light'
    ? { bg: ['#f4f6f9', '#e9eef6'], glow: 'rgba(31,95,214,0.10)', glow2: 'rgba(120,135,160,0.10)', dot: '31,95,214', line: '31,95,214' }
    : { bg: ['#0e1014', '#12161e'], glow: 'rgba(47,123,255,0.16)', glow2: 'rgba(169,177,188,0.08)', dot: '120,170,255', line: '91,155,255' };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  silver: boolean;
}

/** The theme actually painted on <html> (follows «تلقائي» when the device switches). */
export function useDocTheme(): string {
  const [t, setT] = useState(() => document.documentElement.dataset.theme ?? 'dark');
  useEffect(() => {
    const root = document.documentElement;
    const mo = new MutationObserver(() => setT(root.dataset.theme ?? 'dark'));
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return t;
}

export function AmbientBackground() {
  const { settings, ready } = useSettings();
  const { pathname } = useLocation();
  const ref = useRef<HTMLCanvasElement>(null);
  const zone = zoneFor(pathname);
  const level: MotionLevel = settings.motionLevel;
  const kind: BackgroundKind = settings.background;
  const theme = useDocTheme();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !ready || level === 'off' || zone === 'none') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const moving = !reduce && level !== 'static';
    const small = window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4;
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 1 : 1.5);
    const strength = STRENGTH[zone];
    const calm = level === 'calm';
    const pal = palette(theme);
    let w = 0;
    let h = 0;
    let parts: Particle[] = [];

    const seed = () => {
      const area = (w * h) / (small ? 26000 : 16000);
      const n = Math.round(Math.min(small ? 40 : 90, area) * strength * (calm ? 0.7 : 1));
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18 - 0.05,
        r: 0.6 + Math.random() * 1.6,
        a: 0.25 + Math.random() * 0.5,
        silver: Math.random() < 0.3,
      }));
    };
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      draw(performance.now());
    };

    const base = () => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, pal.bg[0]);
      g.addColorStop(1, pal.bg[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };
    const glow = (x: number, y: number, r: number, c: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };

    const draw = (t: number) => {
      const s = t / 1000;
      const speed = calm ? 0.45 : 1;
      base();
      // two slow light sources, always present (they are the «gradient» look on their own)
      const k = moving ? s * 0.05 * speed : 0;
      glow(w * (0.25 + 0.12 * Math.sin(k * 2.1)), h * (0.2 + 0.1 * Math.cos(k * 1.7)), Math.max(w, h) * 0.55, pal.glow.replace(/[\d.]+\)$/, `${0.22 * strength + (kind === 'gradient' ? 0.08 : 0)})`));
      glow(w * (0.8 + 0.1 * Math.cos(k * 1.3)), h * (0.85 + 0.08 * Math.sin(k * 1.9)), Math.max(w, h) * 0.5, pal.glow2);

      if (kind === 'grid' || zone === 'tech') {
        const step = 56;
        const off = moving ? (s * 6 * speed) % step : 0;
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${pal.line},${0.07 * strength})`;
        ctx.beginPath();
        for (let x = -step + off; x < w + step; x += step) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        for (let y = -step + off; y < h + step; y += step) {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
        if (kind === 'grid') {
          // a few brighter nodes travelling along the grid
          for (let i = 0; i < 6; i++) {
            const px = ((i * 211 + s * 18 * speed * (moving ? 1 : 0)) % (w + step)) - step / 2;
            const py = Math.round(((i * 137) % h) / step) * step + off;
            glow(px, py, 26, `rgba(${pal.line},${0.35 * strength})`);
          }
        }
      }

      if (kind === 'waves') {
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) {
          ctx.strokeStyle = `rgba(${pal.line},${(0.1 - i * 0.018) * strength})`;
          ctx.beginPath();
          const amp = 26 + i * 12;
          const yb = h * (0.55 + i * 0.09);
          for (let x = 0; x <= w; x += 12) {
            const y = yb + Math.sin(x / (180 + i * 40) + (moving ? s * 0.35 * speed : 0) + i) * amp;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      if (kind === 'particles' || zone === 'feature' || zone === 'tech') {
        for (const p of parts) {
          if (moving) {
            p.x += p.vx * speed;
            p.y += p.vy * speed;
            if (p.x < -5) p.x = w + 5;
            if (p.x > w + 5) p.x = -5;
            if (p.y < -5) p.y = h + 5;
            if (p.y > h + 5) p.y = -5;
          }
          const c = p.silver ? '200,206,216' : pal.dot;
          ctx.fillStyle = `rgba(${c},${p.a * (kind === 'particles' ? 1 : 0.5) * strength})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (calm && t - last < 33) return; // ~30 fps is plenty for a slow background
      last = t;
      draw(t);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && moving) raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener('resize', resize);
    if (moving) {
      raf = requestAnimationFrame(frame);
      document.addEventListener('visibilitychange', onVisibility);
    }
    canvas.dataset.state = moving ? 'moving' : 'still';
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ready, level, kind, zone, theme]);

  if (!ready || level === 'off' || zone === 'none') return null;
  return <canvas ref={ref} className="ambient-bg" aria-hidden="true" data-testid="ambient-bg" data-kind={kind} data-zone={zone} data-level={level} />;
}
