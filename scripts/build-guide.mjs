// Builds the short operating guide (PDF) from docs/guide/guide.html with the app's own fonts and logo.
// Usage: node scripts/build-guide.mjs  →  release/delivery/دليل-التشغيل.pdf
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const F = 'node_modules/@fontsource';
const work = mkdtempSync(join(tmpdir(), 'guide-'));
mkdirSync(join(work, 'fonts'));
const fonts = {
  'plex-ar-400.woff2': `${F}/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2`,
  'plex-ar-600.woff2': `${F}/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2`,
  'plex-la-400.woff2': `${F}/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff2`,
  'plex-la-600.woff2': `${F}/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-600-normal.woff2`,
  'readex-ar-700.woff2': `${F}/readex-pro/files/readex-pro-arabic-700-normal.woff2`,
  'readex-la-700.woff2': `${F}/readex-pro/files/readex-pro-latin-700-normal.woff2`,
};
for (const [to, from] of Object.entries(fonts)) copyFileSync(from, join(work, 'fonts', to));
copyFileSync('docs/guide/guide.html', join(work, 'guide.html'));
copyFileSync('brand-src/ibrahi8m-mark.svg', join(work, 'ibrahi8m-mark.svg'));

const out = resolve('release/delivery/دليل-التشغيل.pdf');
mkdirSync('release/delivery', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(join(work, 'guide.html')).href);
await page.evaluate(() => document.fonts.ready);
const missing = await page.evaluate(() => [...document.fonts].filter((f) => f.status !== 'loaded').map((f) => f.family));
await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(`guide written: ${out}${missing.length ? ` (fonts not used: ${missing.join(', ')})` : ''}`);
