import type { CurrentUser, Role } from './types';

/**
 * 1.5.0 — local accounts (this device, works offline).
 *
 * Passwords are never stored: only a PBKDF2-SHA-256 hash (210 000 iterations, 16-byte random salt).
 * Every protected operation re-reads the signed-in account from storage and checks its role here;
 * hiding a button is never the only protection.
 *
 * Honest limit: everything lives in this browser's storage on this device. Someone with full access to
 * the device and the browser's developer tools can read or change local data. Server-side protection
 * needs the cloud mode (Supabase) — see cloud.ts and docs/SUPABASE_SETUP.md.
 */

const STORE_KEY = 'ibrahi8m.accounts.v1';
const SESSION_KEY = 'ibrahi8m.session.v1';
export const ITERATIONS = 210_000;
export const SESSION_HOURS = 12;
const MAX_FAILS = 5;
const LOCK_MS = 60_000;

export interface LocalAccount {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  salt: string;
  hash: string;
  iterations: number;
  /** Changes on sign-out everywhere / password change: older sessions stop working. */
  nonce: string;
  disabled?: boolean;
  learnerName?: string;
  failed?: number;
  lockedUntil?: number;
  createdAt: number;
  updatedAt: number;
}

interface Store {
  v: 1;
  accounts: LocalAccount[];
  /** Hash of the owner's one-time recovery code (shown once, at setup). */
  recovery?: { salt: string; hash: string; iterations: number };
}

interface Session {
  accountId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public code: 'invalid' | 'locked' | 'disabled' | 'forbidden' | 'weak' | 'exists' | 'expired' | 'last-admin' | 'not-found' | 'storage',
  ) {
    super(message);
  }
}

/* ───────── storage ───────── */

function read(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { v: 1, accounts: [] };
    const s = JSON.parse(raw) as Store;
    if (s && s.v === 1 && Array.isArray(s.accounts)) return s;
  } catch {
    /* fall through */
  }
  return { v: 1, accounts: [] };
}
function write(s: Store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    throw new AuthError('تعذّر الحفظ في تخزين المتصفح (قد يكون ممتلئًا أو محظورًا).', 'storage');
  }
}
function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function writeSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage blocked: the session lives only until the page closes */
  }
}

/* ───────── crypto ───────── */

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const randomB64 = (n: number) => b64(crypto.getRandomValues(new Uint8Array(n)));
export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : randomB64(12));

export async function hashPassword(password: string, salt: string, iterations = ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations }, key, 256);
  return b64(new Uint8Array(bits));
}
/** Constant-time comparison of two base64 hashes. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* ───────── rules ───────── */

export const normalizeUsername = (u: string) => u.trim().toLowerCase();
export function checkUsername(u: string): string | null {
  const n = normalizeUsername(u);
  if (n.length < 3 || n.length > 40) return 'اسم المستخدم من 3 إلى 40 حرفًا.';
  if (!/^[\p{L}\p{N}._@-]+$/u.test(n)) return 'اسم المستخدم: حروف وأرقام و . _ - @ فقط، دون مسافات.';
  return null;
}
export function checkPassword(p: string): string | null {
  if (p.length < 8) return 'كلمة المرور 8 أحرف على الأقل.';
  if (p.length > 200) return 'كلمة المرور طويلة جدًا.';
  if (!/\p{L}/u.test(p) || !/\p{N}/u.test(p)) return 'كلمة المرور تحتاج حروفًا وأرقامًا معًا.';
  return null;
}

const toUser = (a: LocalAccount): CurrentUser => ({ id: a.id, login: a.username, displayName: a.displayName, role: a.role, mode: 'local', learnerName: a.learnerName });

/* ───────── public API ───────── */

export const hasAccounts = () => read().accounts.length > 0;

/** The signed-in account, re-checked against storage every time (disabled, deleted, signed out elsewhere, expired). */
export function currentAccount(): LocalAccount | null {
  const s = readSession();
  if (!s) return null;
  const a = read().accounts.find((x) => x.id === s.accountId);
  if (!a || a.disabled || a.nonce !== s.nonce || Date.now() > s.expiresAt) return null;
  return a;
}
export function sessionExpired(): boolean {
  const s = readSession();
  return !!s && Date.now() > s.expiresAt;
}
export const currentUser = (): CurrentUser | null => {
  const a = currentAccount();
  return a ? toUser(a) : null;
};
/** Extends an active session (sliding expiry). */
export function touchSession() {
  const s = readSession();
  if (s && currentAccount()) writeSession({ ...s, expiresAt: Date.now() + SESSION_HOURS * 3600_000 });
}

/** Throws unless the signed-in account has one of the roles. Returns it. */
export function requireRole(...roles: Role[]): LocalAccount {
  const a = currentAccount();
  if (!a) throw new AuthError('انتهت الجلسة. سجّل الدخول من جديد.', 'expired');
  if (!roles.includes(a.role)) throw new AuthError('لا تملك صلاحية تنفيذ هذه العملية.', 'forbidden');
  return a;
}

/** First run: the owner creates the admin account. Possible only while no account exists. Returns the recovery code. */
export async function setupOwner(input: { username: string; displayName: string; password: string }): Promise<string> {
  const store = read();
  if (store.accounts.length) throw new AuthError('يوجد حساب أدمن بالفعل.', 'exists');
  const e = checkUsername(input.username) ?? checkPassword(input.password);
  if (e) throw new AuthError(e, 'weak');
  const salt = randomB64(16);
  const now = Date.now();
  const admin: LocalAccount = {
    id: newId(),
    username: normalizeUsername(input.username),
    displayName: input.displayName.trim().slice(0, 80) || input.username.trim(),
    role: 'admin',
    salt,
    hash: await hashPassword(input.password, salt),
    iterations: ITERATIONS,
    nonce: randomB64(12),
    createdAt: now,
    updatedAt: now,
  };
  const { code, recovery } = await newRecovery();
  write({ v: 1, accounts: [admin], recovery });
  writeSession({ accountId: admin.id, nonce: admin.nonce, issuedAt: now, expiresAt: now + SESSION_HOURS * 3600_000 });
  return code;
}

export async function login(username: string, password: string): Promise<CurrentUser> {
  const store = read();
  const a = store.accounts.find((x) => x.username === normalizeUsername(username));
  // same message for unknown user and wrong password
  const invalid = new AuthError('اسم المستخدم أو كلمة المرور غير صحيحة.', 'invalid');
  if (!a) {
    await hashPassword(password, randomB64(16)); // similar timing
    throw invalid;
  }
  if (a.lockedUntil && Date.now() < a.lockedUntil) throw new AuthError(`محاولات كثيرة خاطئة. حاول بعد ${Math.ceil((a.lockedUntil - Date.now()) / 1000)} ثانية.`, 'locked');
  if (a.disabled) throw new AuthError('هذا الحساب موقوف. تواصل مع صاحب المشروع.', 'disabled');
  const ok = same(await hashPassword(password, a.salt, a.iterations), a.hash);
  const fresh = read(); // re-read: another tab may have changed it
  const acc = fresh.accounts.find((x) => x.id === a.id)!;
  if (!ok) {
    acc.failed = (acc.failed ?? 0) + 1;
    if (acc.failed >= MAX_FAILS) {
      acc.lockedUntil = Date.now() + LOCK_MS;
      acc.failed = 0;
    }
    write(fresh);
    throw invalid;
  }
  acc.failed = 0;
  acc.lockedUntil = undefined;
  write(fresh);
  const now = Date.now();
  writeSession({ accountId: acc.id, nonce: acc.nonce, issuedAt: now, expiresAt: now + SESSION_HOURS * 3600_000 });
  return toUser(acc);
}

export function logout() {
  writeSession(null);
}

export function listAccounts(): Omit<LocalAccount, 'salt' | 'hash' | 'nonce'>[] {
  requireRole('admin');
  return read().accounts.map(({ salt: _s, hash: _h, nonce: _n, ...rest }) => rest);
}

export async function createAccount(input: { username: string; displayName: string; password: string; role: Role; learnerName?: string }): Promise<LocalAccount> {
  requireRole('admin');
  const e = checkUsername(input.username) ?? checkPassword(input.password);
  if (e) throw new AuthError(e, 'weak');
  if (!['admin', 'teacher', 'student'].includes(input.role)) throw new AuthError('دور غير معروف.', 'forbidden');
  const store = read();
  const username = normalizeUsername(input.username);
  if (store.accounts.some((x) => x.username === username)) throw new AuthError('اسم المستخدم مستخدم بالفعل.', 'exists');
  const salt = randomB64(16);
  const now = Date.now();
  const displayName = input.displayName.trim().slice(0, 80) || input.username.trim();
  const acc: LocalAccount = {
    id: newId(),
    username,
    displayName,
    role: input.role,
    salt,
    hash: await hashPassword(input.password, salt),
    iterations: ITERATIONS,
    nonce: randomB64(12),
    learnerName: input.role === 'student' ? (input.learnerName?.trim() || displayName).slice(0, 80) : undefined,
    createdAt: now,
    updatedAt: now,
  };
  const again = read();
  if (again.accounts.some((x) => x.username === username)) throw new AuthError('اسم المستخدم مستخدم بالفعل.', 'exists');
  again.accounts.push(acc);
  write(again);
  return acc;
}

function mutate(id: string, fn: (a: LocalAccount, all: LocalAccount[]) => void) {
  const store = read();
  const a = store.accounts.find((x) => x.id === id);
  if (!a) throw new AuthError('الحساب غير موجود.', 'not-found');
  fn(a, store.accounts);
  a.updatedAt = Date.now();
  write(store);
}
const admins = (all: LocalAccount[]) => all.filter((x) => x.role === 'admin' && !x.disabled);

export function setRole(id: string, role: Role) {
  requireRole('admin');
  mutate(id, (a, all) => {
    if (a.role === 'admin' && role !== 'admin' && admins(all).length <= 1) throw new AuthError('لا يمكن إزالة آخر حساب أدمن.', 'last-admin');
    a.role = role;
    if (role === 'student' && !a.learnerName) a.learnerName = a.displayName;
    a.nonce = randomB64(12); // the new role applies from the next sign-in
  });
}

export function setDisabled(id: string, disabled: boolean) {
  const me = requireRole('admin');
  if (me.id === id && disabled) throw new AuthError('لا يمكنك إيقاف حسابك وأنت مسجّل به.', 'forbidden');
  mutate(id, (a, all) => {
    if (disabled && a.role === 'admin' && admins(all).length <= 1) throw new AuthError('لا يمكن إيقاف آخر حساب أدمن.', 'last-admin');
    a.disabled = disabled;
    if (disabled) a.nonce = randomB64(12);
  });
}

export function deleteAccount(id: string) {
  const me = requireRole('admin');
  if (me.id === id) throw new AuthError('لا يمكنك حذف حسابك وأنت مسجّل به.', 'forbidden');
  const store = read();
  const a = store.accounts.find((x) => x.id === id);
  if (!a) throw new AuthError('الحساب غير موجود.', 'not-found');
  if (a.role === 'admin' && admins(store.accounts).length <= 1) throw new AuthError('لا يمكن حذف آخر حساب أدمن.', 'last-admin');
  store.accounts = store.accounts.filter((x) => x.id !== id);
  write(store); // the learner data (attempts, progress, submissions) stays: it belongs to the learner profile
}

/** The admin sets a new password for an account (the user then changes it from «حسابي»). */
export async function adminResetPassword(id: string, password: string) {
  requireRole('admin');
  const e = checkPassword(password);
  if (e) throw new AuthError(e, 'weak');
  const salt = randomB64(16);
  const hash = await hashPassword(password, salt);
  mutate(id, (a) => {
    a.salt = salt;
    a.hash = hash;
    a.iterations = ITERATIONS;
    a.nonce = randomB64(12);
    a.failed = 0;
    a.lockedUntil = undefined;
  });
}

export async function changeOwnPassword(current: string, next: string) {
  const me = requireRole('admin', 'teacher', 'student');
  if (!same(await hashPassword(current, me.salt, me.iterations), me.hash)) throw new AuthError('كلمة المرور الحالية غير صحيحة.', 'invalid');
  const e = checkPassword(next);
  if (e) throw new AuthError(e, 'weak');
  const salt = randomB64(16);
  const hash = await hashPassword(next, salt);
  const nonce = randomB64(12);
  mutate(me.id, (a) => {
    a.salt = salt;
    a.hash = hash;
    a.iterations = ITERATIONS;
    a.nonce = nonce; // other sessions end
  });
  const s = readSession()!;
  writeSession({ ...s, nonce });
}

export function updateOwnName(displayName: string) {
  const me = requireRole('admin', 'teacher', 'student');
  mutate(me.id, (a) => {
    a.displayName = displayName.trim().slice(0, 80) || a.displayName;
  });
}

const cleanCode = (c: string) => c.trim().toUpperCase().replace(/[\s-]/g, '');
async function newRecovery() {
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  const salt = randomB64(16);
  return { code: `${raw.slice(0, 5)}-${raw.slice(5)}`, recovery: { salt, hash: await hashPassword(raw, salt), iterations: ITERATIONS } };
}

/** Forgotten owner password: the one-time recovery code shown at setup resets the first admin account. */
export async function recoverOwner(code: string, username: string, password: string): Promise<string> {
  const store = read();
  const r = store.recovery;
  const a = store.accounts.find((x) => x.username === normalizeUsername(username) && x.role === 'admin');
  const bad = new AuthError('رمز الاستعادة أو اسم المستخدم غير صحيح.', 'invalid');
  if (!r || !a) throw bad;
  if (!same(await hashPassword(cleanCode(code), r.salt, r.iterations), r.hash)) throw bad;
  const e = checkPassword(password);
  if (e) throw new AuthError(e, 'weak');
  const salt = randomB64(16);
  const hash = await hashPassword(password, salt);
  const fresh = read();
  const acc = fresh.accounts.find((x) => x.id === a.id)!;
  Object.assign(acc, { salt, hash, iterations: ITERATIONS, nonce: randomB64(12), failed: 0, lockedUntil: undefined, disabled: false, updatedAt: Date.now() });
  // the code is single use: a new one replaces it and is shown once
  const next = await newRecovery();
  fresh.recovery = next.recovery;
  write(fresh);
  return next.code;
}
