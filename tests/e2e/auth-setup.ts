import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * 1.5.0: the app now opens on the sign-in screen. Every e2e test starts signed in as a test admin
 * (a real local account, PBKDF2-hashed exactly like the app does it), unless a test clears the
 * storage state to test signing in itself (auth.spec.ts). The password exists only in this test helper.
 */
export const TEST_ADMIN = { username: 'test-admin', password: 'Test-pass-1234', displayName: 'مدير الاختبار' };
const ITER = 210_000;
export const STATE = 'tests/e2e/.auth/admin.json';

export function adminState(origin: string) {
  const salt = randomBytes(16).toString('base64');
  const rsalt = randomBytes(16).toString('base64');
  const hash = pbkdf2Sync(TEST_ADMIN.password, Buffer.from(salt, 'base64'), ITER, 32, 'sha256').toString('base64');
  const now = Date.now();
  const id = 'test-admin-id';
  const nonce = randomBytes(12).toString('base64');
  const store = {
    v: 1,
    accounts: [{ id, username: TEST_ADMIN.username, displayName: TEST_ADMIN.displayName, role: 'admin', salt, hash, iterations: ITER, nonce, createdAt: now, updatedAt: now }],
    recovery: { salt: rsalt, hash: pbkdf2Sync('TESTCODE01', Buffer.from(rsalt, 'base64'), ITER, 32, 'sha256').toString('base64'), iterations: ITER },
  };
  const session = { accountId: id, nonce, issuedAt: now, expiresAt: now + 7 * 24 * 3600_000 };
  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          { name: 'ibrahi8m.accounts.v1', value: JSON.stringify(store) },
          { name: 'ibrahi8m.session.v1', value: JSON.stringify(session) },
        ],
      },
    ],
  };
}

export default function globalSetup() {
  mkdirSync('tests/e2e/.auth', { recursive: true });
  writeFileSync(STATE, JSON.stringify(adminState('http://localhost:4174')));
}
