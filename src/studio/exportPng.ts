import plexAr400 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2?url';
import plexLa400 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff2?url';
import plexAr600 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2?url';
import plexLa600 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-600-normal.woff2?url';
import plexAr700 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2?url';
import plexLa700 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-700-normal.woff2?url';
import readexAr600 from '@fontsource/readex-pro/files/readex-pro-arabic-600-normal.woff2?url';
import readexLa600 from '@fontsource/readex-pro/files/readex-pro-latin-600-normal.woff2?url';
import readexAr700 from '@fontsource/readex-pro/files/readex-pro-arabic-700-normal.woff2?url';
import readexLa700 from '@fontsource/readex-pro/files/readex-pro-latin-700-normal.woff2?url';
import { FONT_BODY, FONT_HEAD, resetMeasureCache } from './text';

/**
 * Turns a design's SVG into a PNG entirely on the device. An SVG drawn into a canvas cannot
 * use the page's fonts, so the app's own font files (bundled, same origin, cached offline)
 * are embedded into the SVG first. No network, no server.
 */

const AR = 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';
const LA = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

const FACES: { family: string; weight: number; url: string; range: string }[] = [
  { family: FONT_BODY, weight: 400, url: plexAr400, range: AR },
  { family: FONT_BODY, weight: 400, url: plexLa400, range: LA },
  { family: FONT_BODY, weight: 500, url: plexAr600, range: AR },
  { family: FONT_BODY, weight: 500, url: plexLa600, range: LA },
  { family: FONT_BODY, weight: 600, url: plexAr600, range: AR },
  { family: FONT_BODY, weight: 600, url: plexLa600, range: LA },
  { family: FONT_BODY, weight: 700, url: plexAr700, range: AR },
  { family: FONT_BODY, weight: 700, url: plexLa700, range: LA },
  { family: FONT_HEAD, weight: 600, url: readexAr600, range: AR },
  { family: FONT_HEAD, weight: 600, url: readexLa600, range: LA },
  { family: FONT_HEAD, weight: 700, url: readexAr700, range: AR },
  { family: FONT_HEAD, weight: 700, url: readexLa700, range: LA },
];

let fontCss: Promise<string> | null = null;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** @font-face rules with the font files inlined as data: URLs (built once per session). */
export function embeddedFontCss(): Promise<string> {
  if (!fontCss) {
    fontCss = (async () => {
      const cache = new Map<string, string>();
      const rules: string[] = [];
      for (const f of FACES) {
        if (!cache.has(f.url)) {
          const res = await fetch(f.url);
          if (!res.ok) throw new Error('تعذّر تحميل ملف الخط من التطبيق.');
          cache.set(f.url, toBase64(await res.arrayBuffer()));
        }
        rules.push(`@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};src:url(data:font/woff2;base64,${cache.get(f.url)}) format('woff2');unicode-range:${f.range};}`);
      }
      return rules.join('\n');
    })().catch((e) => {
      fontCss = null;
      throw e;
    });
  }
  return fontCss;
}

/** Waits until the page's own fonts used by designs are loaded, so measurements match the export. */
export async function designFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(
    [`400 18px "${FONT_BODY}"`, `600 18px "${FONT_BODY}"`, `700 18px "${FONT_HEAD}"`, `600 18px "${FONT_HEAD}"`].map((f) => document.fonts.load(f, 'أبجد abc').catch(() => [])),
  );
  resetMeasureCache();
}

export interface Png {
  blob: Blob;
  width: number;
  height: number;
}

/** Largest picture we draw: keeps memory reasonable on phones. */
const MAX_PIXELS = 16_000_000;

export async function svgToPng(svg: SVGSVGElement, opts: { scale?: number } = {}): Promise<Png> {
  const w = Number(svg.getAttribute('data-width') || svg.viewBox.baseVal.width);
  const h = Number(svg.getAttribute('data-height') || svg.viewBox.baseVal.height);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.removeAttribute('class');
  clone.removeAttribute('style');
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = await embeddedFontCss();
  clone.insertBefore(style, clone.firstChild);
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    img.src = url;
    await img.decode();
    // Embedded fonts can finish a moment after decoding; give them a frame.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
    const scale = Math.min(opts.scale ?? 2, Math.sqrt(MAX_PIXELS / (w * h)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const c = canvas.getContext('2d');
    if (!c) throw new Error('المتصفح لا يدعم الرسم على اللوحة.');
    c.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('تعذّر إنشاء الصورة.');
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A safe file name from the design title (Arabic letters kept). */
export function fileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'تصميم';
  return `${base}.png`;
}

/** Saves the PNG through the browser's download (on the desktop app: a save dialog). */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
