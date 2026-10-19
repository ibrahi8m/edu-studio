import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Runtime status: service-worker readiness, pending update, connectivity.
 * The desktop shell exposes `window.ibrahi8mDesktop`; there the files are on
 * disk, so no service worker is needed.
 */
declare global {
  interface Window {
    ibrahi8mDesktop?: { platform: string; version: string };
  }
}

export type OfflineState = 'desktop' | 'ready' | 'installing' | 'unsupported' | 'dev';

interface RuntimeSnapshot {
  offline: OfflineState;
  needRefresh: boolean;
}

let snapshot: RuntimeSnapshot = {
  offline: window.ibrahi8mDesktop
    ? 'desktop'
    : import.meta.env.DEV
      ? 'dev'
      : 'serviceWorker' in navigator
        ? 'installing'
        : 'unsupported',
  needRefresh: false,
};
const listeners = new Set<() => void>();
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

function set(patch: Partial<RuntimeSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}

export async function initServiceWorker() {
  if (snapshot.offline !== 'installing') return;
  try {
    const { registerSW } = await import('virtual:pwa-register');
    applyUpdate = registerSW({
      immediate: true,
      onOfflineReady() {
        set({ offline: 'ready' });
      },
      onNeedRefresh() {
        set({ needRefresh: true });
      },
      onRegisterError() {
        set({ offline: 'unsupported' });
      },
    });
    // Already installed on a previous visit: the page is controlled from the start.
    const reg = await navigator.serviceWorker.ready;
    if (reg.active && navigator.serviceWorker.controller) set({ offline: 'ready' });
    navigator.serviceWorker.addEventListener('controllerchange', () => set({ offline: 'ready' }));
  } catch {
    set({ offline: 'unsupported' });
  }
}

export async function applyPendingUpdate() {
  if (applyUpdate) await applyUpdate(true);
}

export function dismissUpdate() {
  set({ needRefresh: false });
}

export function useRuntime(): RuntimeSnapshot {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export const OFFLINE_LABEL: Record<OfflineState, { text: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  desktop: { text: 'نسخة سطح المكتب: الملفات على الجهاز', tone: 'success' },
  ready: { text: 'جاهز للعمل دون إنترنت', tone: 'success' },
  installing: { text: 'جارٍ تجهيز العمل دون إنترنت…', tone: 'warning' },
  unsupported: { text: 'المتصفح لا يدعم العمل دون إنترنت', tone: 'danger' },
  dev: { text: 'وضع التطوير (دون Service Worker)', tone: 'neutral' },
};
