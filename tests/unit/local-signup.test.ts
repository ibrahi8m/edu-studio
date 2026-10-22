import { beforeEach, describe, expect, it } from 'vitest';

// a minimal localStorage for the node test environment
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
} as Storage;

const local = await import('../../src/auth/local');

describe('1.6.0 «إنشاء حساب جديد» on this device', () => {
  beforeEach(() => mem.clear());

  it('is refused before the owner exists (the first account is always the owner, at setup)', async () => {
    await expect(local.registerLocal({ username: 'sara', password: 'Pass-1234' })).rejects.toThrow('ابدأ بإنشاء حساب الأدمن');
    expect(local.selfSignupAllowed()).toBe(false);
  });

  it('creates a STUDENT (never admin), stores only a hash, rejects duplicates and weak passwords, and signs in offline', async () => {
    await local.setupOwner({ username: 'owner', displayName: 'المالك', password: 'Owner-pass-1' });
    local.logout();
    expect(local.selfSignupAllowed()).toBe(true);
    await expect(local.registerLocal({ username: 'ab', password: 'Pass-1234' })).rejects.toThrow('3 إلى 40');
    await expect(local.registerLocal({ username: 'sara', password: 'short1' })).rejects.toThrow('8 أحرف');
    await expect(local.registerLocal({ username: 'sara', password: 'onlyletters' })).rejects.toThrow('حروفًا وأرقامًا');
    await expect(local.registerLocal({ username: 'OWNER', password: 'Pass-1234' })).rejects.toThrow('مستخدم بالفعل');
    const r = await local.registerLocal({ username: 'Sara.S', password: 'Pass-1234' });
    expect(r.username).toBe('sara.s');
    await expect(local.registerLocal({ username: 'sara.s', password: 'Pass-1234' })).rejects.toThrow('مستخدم بالفعل');
    const raw = mem.get('ibrahi8m.accounts.v1')!;
    expect(raw).not.toContain('Pass-1234'); // never the password itself
    const stored = JSON.parse(raw).accounts.find((a: { username: string }) => a.username === 'sara.s');
    expect(stored.role).toBe('student');
    expect(stored.hash).toMatch(/^[A-Za-z0-9+/=]{40,}$/);
    expect(local.currentUser()).toBeNull(); // sign-up does not sign in
    const u = await local.login('sara.s', 'Pass-1234');
    expect(u.role).toBe('student');
    expect(u.learnerName).toBe('Sara.S');
    // a student cannot do admin operations through the data layer
    expect(() => local.listAccounts()).toThrow('لا تملك صلاحية');
    expect(() => local.setRole(stored.id, 'admin')).toThrow('لا تملك صلاحية');
    expect(() => local.setSelfSignup(false)).toThrow('لا تملك صلاحية');
  });

  it('the admin can stop self sign-up; existing accounts are untouched', async () => {
    await local.setupOwner({ username: 'owner', displayName: 'المالك', password: 'Owner-pass-1' });
    await local.registerLocal({ username: 'sara', password: 'Pass-1234' });
    const before = JSON.parse(mem.get('ibrahi8m.accounts.v1')!).accounts.map((a: { id: string; hash: string; role: string }) => [a.id, a.hash, a.role]);
    local.setSelfSignup(false); // owner is signed in after setup
    expect(local.selfSignupAllowed()).toBe(false);
    await expect(local.registerLocal({ username: 'other', password: 'Pass-1234' })).rejects.toThrow('متوقف');
    const after = JSON.parse(mem.get('ibrahi8m.accounts.v1')!).accounts.map((a: { id: string; hash: string; role: string }) => [a.id, a.hash, a.role]);
    expect(after).toEqual(before);
  });
});
