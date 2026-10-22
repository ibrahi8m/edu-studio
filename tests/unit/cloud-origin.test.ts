import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { CLOUD } from '../../src/auth/cloud';

// 1.5.1: the Supabase address lives in four places; the desktop guard once missed it and blocked every cloud sign-in.
const { CLOUD_ORIGIN } = createRequire(import.meta.url)('../../electron/cloud-origin.cjs') as { CLOUD_ORIGIN: string };

describe('one Supabase origin everywhere', () => {
  it('the app, the desktop network guard, the CSP and the offline check name the same origin', () => {
    expect(new URL(CLOUD.url).origin).toBe(CLOUD.url);
    expect(CLOUD_ORIGIN).toBe(CLOUD.url);
    expect(readFileSync('vite.config.ts', 'utf8')).toContain(`"connect-src 'self' ${CLOUD.url}"`);
    const check = readFileSync('scripts/check-offline.mjs', 'utf8');
    const m = /ALLOWED_SERVICES = \[\/(.+)\/\];/.exec(check);
    expect(m).not.toBeNull();
    const re = new RegExp(m![1]);
    expect(re.test(`${CLOUD.url}/auth/v1/token`)).toBe(true);
    expect(re.test('https://evil.supabase.co/')).toBe(false);
  });
  it('the desktop main process uses that origin for its allow rule', () => {
    const main = readFileSync('electron/main.cjs', 'utf8');
    expect(main).toContain("require('./cloud-origin.cjs')");
    expect(main).toMatch(/new URL\(url\)\.origin === CLOUD_ORIGIN/);
  });
  it('the key in the app is the publishable one, never a secret / service_role key', () => {
    expect(CLOUD.key.startsWith('sb_publishable_')).toBe(true);
    expect(CLOUD.key).not.toMatch(/^sb_secret_/);
  });
});
