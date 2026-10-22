import type { CurrentUser, Role } from './types';

/**
 * 1.5.0 — cloud accounts through Supabase (Auth + a `profiles` table protected by Row Level Security).
 * Plain fetch to the Supabase REST endpoints: no SDK, no secret. The key below is the project's
 * PUBLISHABLE key (meant to be in apps); the server's secret / service_role key must never be here.
 * Roles live in `profiles.role` on the server and are enforced by the policies in supabase/schema.sql:
 * a user can read only their own profile, cannot change their own role, and only an admin can manage others.
 */
export const CLOUD = {
  url: 'https://wqhyubqoxqlcefwqnpwq.supabase.co',
  key: 'sb_publishable_oUjYYweRokZorggB7DQK_w_GzkPVXAY',
};
export const cloudConfigured = () => !!CLOUD.url && !!CLOUD.key;

const KEY = 'ibrahi8m.cloud-session.v1';
interface CloudSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // seconds
  user: CurrentUser;
}

export class CloudError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

function read(): CloudSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CloudSession) : null;
  } catch {
    return null;
  }
}
function write(s: CloudSession | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* blocked storage: session lasts until the page closes */
  }
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${CLOUD.url}${path}`, {
      ...init,
      headers: { apikey: CLOUD.key, 'Content-Type': 'application/json', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new CloudError('تعذّر الاتصال بالخادم. تحقق من الإنترنت، أو استخدم الحسابات المحلية.');
  }
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const msg = String(body.error_description ?? body.msg ?? body.message ?? body.error ?? res.statusText);
    if (res.status === 400 && /invalid login credentials/i.test(msg)) throw new CloudError('البريد الإلكتروني أو كلمة المرور غير صحيحة.', 400);
    if (/email not confirmed/i.test(msg)) throw new CloudError('لم يُؤكَّد البريد الإلكتروني بعد. افتح رسالة التأكيد في بريدك.', res.status);
    if (res.status === 429 && /email rate limit/i.test(msg))
      throw new CloudError('وصل Supabase إلى حدّ إرسال الرسائل (خدمة البريد المدمجة: رسالتان في الساعة للمشروع كله). انتظر حتى ساعة ثم اطلب مرة واحدة، ولا تكرر الطلب.', 429);
    if (res.status === 429) throw new CloudError('طلبات كثيرة في وقت قصير. انتظر دقيقة ثم حاول مرة واحدة.', 429);
    if (/should be different/i.test(msg)) throw new CloudError('كلمة المرور الجديدة يجب أن تختلف عن القديمة.', res.status);
    if (/weak|at least/i.test(msg) && res.status === 422) throw new CloudError('كلمة المرور ضعيفة: 8 أحرف على الأقل، فيها حروف وأرقام.', 422);
    if (res.status === 401 || res.status === 403) throw new CloudError('لا تملك صلاحية هذه العملية، أو انتهت الجلسة.', res.status);
    throw new CloudError(`خطأ من الخادم (${res.status}): ${msg}`, res.status);
  }
  return body as T;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email: string };
}
interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  learner_name: string | null;
  disabled: boolean;
}

async function profileFor(token: string, id: string): Promise<ProfileRow> {
  let rows: ProfileRow[];
  try {
    rows = await call<ProfileRow[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=*`, { token });
  } catch (e) {
    // 1.6.0: the password was accepted but the server refused to return the account's role (table privileges
    // missing on the project: HTTP 403 / 42501). Say so instead of a generic message.
    if (e instanceof CloudError && (e.status === 401 || e.status === 403))
      throw new CloudError('كلمة المرور صحيحة، لكن الخادم رفض قراءة دور الحساب. على صاحب المشروع تنفيذ الملف supabase/fix-1.6-grants.sql في Supabase مرة واحدة.', e.status);
    throw e;
  }
  if (!Array.isArray(rows) || !rows[0]) throw new CloudError('لا يوجد ملف لهذا الحساب على الخادم. هل نُفّذ ملف supabase/schema.sql؟');
  return rows[0];
}

function toSession(t: TokenResponse, p: ProfileRow): CloudSession {
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + t.expires_in,
    user: { id: p.id, login: p.email, displayName: p.display_name || p.email, role: p.role, mode: 'cloud', learnerName: p.role === 'student' ? p.learner_name || p.display_name || p.email : undefined },
  };
}

export async function cloudLogin(email: string, password: string): Promise<CurrentUser> {
  const t = await call<TokenResponse>('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
  const p = await profileFor(t.access_token, t.user.id);
  if (p.disabled) throw new CloudError('هذا الحساب موقوف. تواصل مع صاحب المشروع.');
  const s = toSession(t, p);
  write(s);
  return s.user;
}

/** New accounts are always «طالب» on the server (a database trigger); only an admin can change a role. */
export async function cloudSignUp(email: string, password: string, displayName: string): Promise<'confirm' | 'ready'> {
  const r = await call<{ access_token?: string }>('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: email.trim(), password, data: { display_name: displayName.trim() } }) });
  return r.access_token ? 'ready' : 'confirm';
}

/**
 * 1.5.2 — password recovery that can actually be finished. The e-mail link goes to the web app (it must be listed in
 * Supabase → Authentication → URL Configuration → Redirect URLs; it is the Site URL). The web app reads the one-time
 * recovery token from the link (captureRecoveryLink, called before the router starts) and opens «كلمة مرور جديدة».
 * Works from any version: the desktop and phone apps send the same link, which opens in the browser.
 */
export const RESET_REDIRECT = 'https://ibrahi8m.github.io/edu-studio/';
const RECOVERY_KEY = 'ibrahi8m.cloud-recovery.v1';

export async function cloudRecover(email: string): Promise<void> {
  await call(`/auth/v1/recover?redirect_to=${encodeURIComponent(RESET_REDIRECT)}`, { method: 'POST', body: JSON.stringify({ email: email.trim() }) });
}

/** Turns «…/#access_token=…&type=recovery» (or «#error=…») into the «#/reset-password» page; the token stays in this tab only. */
export function captureRecoveryLink(loc: { hash: string } = window.location): boolean {
  const h = loc.hash.replace(/^#/, '');
  if (!/(^|&)(access_token|error_code|error)=/.test(h) || h.startsWith('/')) return false;
  const p = new URLSearchParams(h);
  let value: { token?: string; error?: string };
  if (p.get('access_token') && p.get('type') === 'recovery') value = { token: p.get('access_token')! };
  else if (p.get('error_code') || p.get('error')) value = { error: p.get('error_code') === 'otp_expired' ? 'expired' : 'invalid' };
  else return false;
  try {
    sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(value));
  } catch {
    /* storage blocked: the page will say the link is invalid */
  }
  // remove the token from the address bar and history
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/reset-password`);
  return true;
}

export function pendingRecovery(): { token?: string; error?: string } | null {
  try {
    const raw = sessionStorage.getItem(RECOVERY_KEY);
    return raw ? (JSON.parse(raw) as { token?: string; error?: string }) : null;
  } catch {
    return null;
  }
}

/** Sets the new password with the one-time recovery session, then ends that session; the user signs in normally. */
export async function cloudSetNewPassword(password: string): Promise<void> {
  const token = pendingRecovery()?.token;
  if (!token) throw new CloudError('رابط الاستعادة غير صالح أو استُخدم من قبل. اطلب رابطًا جديدًا بعد ساعة.');
  await call('/auth/v1/user', { method: 'PUT', token, body: JSON.stringify({ password }) });
  try {
    sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    /* ignore */
  }
  await call('/auth/v1/logout?scope=local', { method: 'POST', token }).catch(() => undefined);
}

/** The signed-in cloud user, or null when signed out or the session has expired and cannot be refreshed. */
export async function cloudCurrent(): Promise<CurrentUser | null> {
  const s = read();
  if (!s) return null;
  if (Date.now() / 1000 < s.expires_at - 60) return s.user;
  try {
    const t = await call<TokenResponse>('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: s.refresh_token }) });
    const p = await profileFor(t.access_token, t.user.id);
    if (p.disabled) throw new CloudError('disabled');
    const n = toSession(t, p);
    write(n);
    return n.user;
  } catch {
    write(null);
    return null;
  }
}
export const cloudCachedUser = () => read()?.user ?? null;
export const cloudToken = () => read()?.access_token ?? '';

export async function cloudLogout() {
  const s = read();
  write(null);
  if (s) await call('/auth/v1/logout', { method: 'POST', token: s.access_token }).catch(() => undefined);
}

/* ───────── admin (the server checks the role again: see supabase/schema.sql) ───────── */

export async function cloudListProfiles(): Promise<ProfileRow[]> {
  return call<ProfileRow[]>('/rest/v1/profiles?select=*&order=created_at.asc', { token: cloudToken() });
}
export async function cloudUpdateProfile(id: string, patch: Partial<Pick<ProfileRow, 'role' | 'disabled' | 'display_name' | 'learner_name'>>) {
  await call(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', token: cloudToken(), headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
}
