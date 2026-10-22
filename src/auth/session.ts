import { useSyncExternalStore } from 'react';
import * as local from './local';
import * as cloud from './cloud';
import type { AuthMode, CurrentUser, Role } from './types';

/**
 * 1.5.0 — the one place the app asks «who is signed in?». Works for both modes:
 *  - local: accounts on this device (local.ts), works offline;
 *  - cloud: Supabase accounts (cloud.ts), needs the internet to sign in.
 */

const MODE_KEY = 'ibrahi8m.auth-mode';

export function getMode(): AuthMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'cloud' && cloud.cloudConfigured() ? 'cloud' : 'local';
  } catch {
    return 'local';
  }
}
export function setMode(m: AuthMode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* ignore */
  }
  emit({ ...state, mode: getMode() });
}

interface AuthState {
  mode: AuthMode;
  user: CurrentUser | null;
  /** The previous session ended by itself (time limit, password change, account stopped). */
  expired: boolean;
  /** Cloud mode is checking the stored session. */
  checking: boolean;
}

let state: AuthState = initial();
const listeners = new Set<() => void>();
function emit(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}
function initial(): AuthState {
  const mode = getMode();
  if (mode === 'cloud') return { mode, user: cloud.cloudCachedUser(), expired: false, checking: true };
  return { mode, user: local.currentUser(), expired: local.sessionExpired(), checking: false };
}

/** Re-checks the session against storage (or the server). Called on start, on navigation and every minute. */
export async function revalidate() {
  const mode = getMode();
  if (mode === 'cloud') {
    const user = await cloud.cloudCurrent();
    emit({ mode, user, expired: !user && !!state.user, checking: false });
    return;
  }
  const user = local.currentUser();
  if (user) local.touchSession();
  const changed = JSON.stringify(user) !== JSON.stringify(state.user);
  if (changed || state.mode !== mode) emit({ mode, user, expired: !user && (!!state.user || local.sessionExpired()), checking: false });
}

export async function signIn(login: string, password: string): Promise<CurrentUser> {
  const mode = getMode();
  const user = mode === 'cloud' ? await cloud.cloudLogin(login, password) : await local.login(login, password);
  emit({ mode, user, expired: false, checking: false });
  return user;
}

export async function signOut() {
  if (getMode() === 'cloud') await cloud.cloudLogout();
  else local.logout();
  emit({ ...state, user: null, expired: false, checking: false });
}

/** After the owner's first-run setup (local) the new admin is signed in. */
export function refreshFromStorage() {
  emit({ ...state, mode: getMode(), user: getMode() === 'local' ? local.currentUser() : state.user, expired: false, checking: false });
}

export const getAuth = () => state;
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getAuth, getAuth);
}
export const hasRole = (...roles: Role[]) => !!state.user && roles.includes(state.user.role);

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    // signed in or out in another tab
    if (e.key && e.key.startsWith('ibrahi8m.')) void revalidate();
  });
  window.setInterval(() => void revalidate(), 60_000);
}
