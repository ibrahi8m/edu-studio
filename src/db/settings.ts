import type { EduDB } from './db';

export type ThemeMode = 'dark' | 'light' | 'system';
export type FontScale = 1 | 1.15 | 1.3;
export type MotionMode = 'system' | 'reduce';

export interface Settings {
  theme: ThemeMode;
  fontScale: FontScale;
  motion: MotionMode;
  showSplash: boolean;
  ownerName: string;
  ownerFullName: string;
  university: string;
  program: string;
  course: string;
  instructor: string;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  fontScale: 1,
  motion: 'system',
  showSplash: true,
  ownerName: 'إبراهيم',
  ownerFullName: '',
  university: '',
  program: 'ماجستير المناهج وطرق التدريس',
  course: 'تصميم المحتوى الرقمي',
  instructor: '',
};

const VALIDATORS: { [K in keyof Settings]: (v: unknown) => boolean } = {
  theme: (v) => v === 'dark' || v === 'light' || v === 'system',
  fontScale: (v) => v === 1 || v === 1.15 || v === 1.3,
  motion: (v) => v === 'system' || v === 'reduce',
  showSplash: (v) => typeof v === 'boolean',
  ownerName: (v) => typeof v === 'string' && v.length <= 80,
  ownerFullName: (v) => typeof v === 'string' && v.length <= 160,
  university: (v) => typeof v === 'string' && v.length <= 160,
  program: (v) => typeof v === 'string' && v.length <= 160,
  course: (v) => typeof v === 'string' && v.length <= 160,
  instructor: (v) => typeof v === 'string' && v.length <= 160,
};

export function isSettingKey(key: string): key is keyof Settings {
  return Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key);
}

/** Reads all settings; unknown or invalid stored values fall back to defaults. */
export async function loadSettings(database: EduDB): Promise<Settings> {
  return loadSettingsFromRows(await database.settings.toArray());
}

/** Settings from stored rows (also used to check rows inside an imported file). */
export function loadSettingsFromRows(rows: { key: string; value: unknown }[]): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (isSettingKey(row.key) && VALIDATORS[row.key](row.value)) {
      (out as unknown as Record<string, unknown>)[row.key] = row.value;
    }
  }
  return out;
}

export async function saveSetting<K extends keyof Settings>(
  database: EduDB,
  key: K,
  value: Settings[K],
): Promise<void> {
  if (!VALIDATORS[key](value)) {
    throw new Error(`قيمة غير صالحة للإعداد ${String(key)}`);
  }
  await database.settings.put({ key, value, updatedAt: Date.now() });
}

export async function resetSettings(database: EduDB): Promise<void> {
  await database.settings.clear();
}
