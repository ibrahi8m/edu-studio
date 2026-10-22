// Fails the build if the output references anything outside the app.
// Every URL found in dist/ must be either relative or in the allowlist of
// strings that are never fetched (XML namespaces, error-message links).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const DIST = process.argv[2] ?? 'dist';
const TEXT_EXT = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.txt']);

// Strings that look like URLs but are never requested by the browser.
export const NON_FETCHED = [
  /^https?:\/\/www\.w3\.org\//, // SVG / XHTML / XLink namespaces
  /^https:\/\/react\.dev\/errors\//, // React production error text
  /^https:\/\/reactjs\.org\/docs\/error-decoder/, // React error text
  /^https:\/\/reactrouter\.com\//, // router warning text
  /^https:\/\/remix\.run\//, // router warning text
  /^https:\/\/github\.com\/(dexie|dfahlander|remix-run|GoogleChrome)\//, // library help links in messages
  /^https:\/\/dexie\.org\//, // Dexie error help text
  /^https:\/\/bugs\.chromium\.org\//, // Dexie comment-derived text
  /^https:\/\/developer\.mozilla\.org\//, // help text
  /^https:\/\/goo\.gl\//, // Workbox help text
  // Exact short links that only appear inside error/warning message strings:
  /^https:\/\/tinyurl\.com\/y2uuvskb$/, // Dexie "IndexedDB API missing" message
  /^http:\/\/bit\.ly\/2kdckMn$/, // Dexie "PrematureCommit" message
  /^https:\/\/bit\.ly\/wb-precache$/, // Workbox console.warn text
];

// 1.5.0: the only online service the app may call — the owner's Supabase project, used ONLY when someone
// chooses «حساب سحابي» at sign-in. Everything else still works offline. Also allowed by the CSP (vite.config.ts).
export const ALLOWED_SERVICES = [/^https:\/\/wqhyubqoxqlcefwqnpwq\.supabase\.co([/;]|$)/];

const URL_RE = /https?:\/\/[^\s"'`)<>\\]+/g;

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function findExternalUrls(text) {
  const out = [];
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0];
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) continue;
    if (NON_FETCHED.some((re) => re.test(url))) continue;
    if (ALLOWED_SERVICES.some((re) => re.test(url))) continue;
    out.push(url);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = walk(DIST).filter((f) => TEXT_EXT.has(extname(f)));
  const problems = [];
  for (const f of files) {
    for (const url of findExternalUrls(readFileSync(f, 'utf8'))) problems.push(`${f}: ${url}`);
  }
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  if (!html.includes('Content-Security-Policy')) problems.push('index.html: missing Content-Security-Policy');
  if (/fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg|jsdelivr/i.test(walk(DIST).filter((f) => TEXT_EXT.has(extname(f))).map((f) => readFileSync(f, 'utf8')).join('\n')))
    problems.push('a CDN or hosted-font reference was found');

  if (problems.length) {
    console.error('✗ offline check failed — external references found:');
    for (const p of problems) console.error('  ' + p);
    process.exit(1);
  }
  console.log(`✓ offline check passed: ${files.length} files scanned, no external references (the optional cloud-account service is the only allowed one).`);
}
