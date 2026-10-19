export interface StorageInfo {
  supported: boolean;
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

/** Asks the browser not to evict local data under storage pressure. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function getStorageInfo(): Promise<StorageInfo> {
  try {
    if (!navigator.storage) return { supported: false, persisted: null, usage: null, quota: null };
    const [persisted, est] = await Promise.all([
      navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(null),
      navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve({} as StorageEstimate),
    ]);
    return {
      supported: true,
      persisted,
      usage: est.usage ?? null,
      quota: est.quota ?? null,
    };
  } catch {
    return { supported: false, persisted: null, usage: null, quota: null };
  }
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  const units = ['بايت', 'ك.ب', 'م.ب', 'غ.ب'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('ar', { maximumFractionDigits: i === 0 ? 0 : 1 })} ${units[i]}`;
}
