/**
 * Text measurement and line wrapping for SVG designs (SVG has no automatic wrapping).
 * In the browser the real font is measured on a canvas, so the picture on screen and the
 * exported PNG break lines at the same places. Without a canvas (unit tests) an estimate is used.
 */

export const FONT_BODY = 'IBM Plex Sans Arabic';
export const FONT_HEAD = 'Readex Pro';

export type Measure = (text: string, size: number, weight: number, family?: string) => number;

/** Rough width: Arabic glyphs average ~0.52 em in these fonts. */
export const estimate: Measure = (text, size) => text.length * size * 0.52;

let ctx: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();

export const measure: Measure = (text, size, weight, family = FONT_BODY) => {
  if (ctx === undefined) {
    try {
      ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    } catch {
      ctx = null;
    }
  }
  if (!ctx) return estimate(text, size, weight, family);
  const key = `${family}|${weight}|${size}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  ctx.font = `${weight} ${size}px "${family}", sans-serif`;
  ctx.direction = 'rtl';
  const w = ctx.measureText(text).width;
  if (cache.size > 5000) cache.clear();
  cache.set(key, w);
  return w;
};

/** Forget measurements taken before the web fonts finished loading. */
export function resetMeasureCache() {
  cache.clear();
}

/**
 * Splits text into lines no wider than `max`. Respects line breaks typed by the user,
 * breaks very long words, and ends with «…» when `maxLines` is reached.
 */
export function wrap(text: string, max: number, size: number, weight = 400, opts: { maxLines?: number; family?: string; m?: Measure } = {}): string[] {
  const m = opts.m ?? measure;
  const fam = opts.family ?? FONT_BODY;
  const width = (s: string) => m(s, size, weight, fam);
  const out: string[] = [];
  for (const para of text.replace(/\r/g, '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      if (out.length) out.push('');
      continue;
    }
    let line = '';
    for (let word of words) {
      // A word wider than the box is cut into pieces.
      while (width(word) > max && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && width(word.slice(0, cut)) > max) cut--;
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const next = line ? `${line} ${word}` : word;
      if (width(next) <= max || !line) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  const limit = opts.maxLines ?? Infinity;
  if (out.length > limit) {
    const kept = out.slice(0, limit);
    let last = kept[limit - 1];
    while (last && width(`${last}…`) > max) last = last.slice(0, -1);
    kept[limit - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return out;
}

/** Widest line, for sizing boxes around text. */
export function widest(lines: string[], size: number, weight = 400, family = FONT_BODY, m: Measure = measure): number {
  return lines.reduce((w, l) => Math.max(w, m(l, size, weight, family)), 0);
}
