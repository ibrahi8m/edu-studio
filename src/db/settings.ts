import type { EduDB } from './db';

export type ThemeMode = 'dark' | 'light' | 'system';
export type FontScale = 1 | 1.15 | 1.3;
export type MotionMode = 'system' | 'reduce';

/** 1.1.0: the CV shown in «صفحتي». Seeded with the owner's data; every field is editable. */
export interface CvData {
  name: string;
  title: string;
  residence: string;
  birthYear: string;
  phone: string;
  email: string;
  summary: string;
  education: string[];
  experience: string[];
  courses: string[];
  techSkills: string[];
  proSkills: string[];
  languages: { name: string; level: string }[];
  references: string;
}

export const NOT_SET = 'غير محدد حاليًا';

export const DEFAULT_CV: CvData = {
  name: 'إبراهيم سمير محمود الخطيب',
  title: 'إعلامي | مصمم وسائط متعددة | صانع محتوى رقمي | منسق مشاريع',
  residence: 'خان يونس – قطاع غزة، فلسطين',
  birthYear: '2002',
  phone: NOT_SET,
  email: NOT_SET,
  summary:
    'إعلامي ومصمم وسائط متعددة وصانع محتوى رقمي، أمتلك خبرة في إنتاج المواد الإعلامية والتصميم والمونتاج وإعداد المحتوى الرقمي، إلى جانب المشاركة في تنسيق المشاريع والأعمال المؤسسية. أسعى إلى توظيف مهاراتي الإبداعية والتقنية والتنظيمية في تطوير محتوى احترافي يخدم الأهداف التعليمية والإعلامية والمؤسسية.',
  education: ['ماجستير المناهج وطرق التدريس – الجامعة الإسلامية، كلية التربية', 'بكالوريوس الوسائط المتعددة – الكلية الجامعية للعلوم والتكنولوجيا'],
  experience: ['إعلامي – جمعية واحة الأمل', 'إعلامي – مؤسسة سنابل', 'مصمم وسائط متعددة وصانع محتوى رقمي – عمل حر'],
  courses: ['دورات في التصميم والمونتاج والمحتوى الرقمي من: مركز السلام، Golden House'],
  techSkills: ['Adobe Photoshop', 'Adobe Illustrator', 'Adobe Premiere Pro', 'Adobe After Effects', 'Canva', 'أدوات الذكاء الاصطناعي المستخدمة في التصميم وصناعة المحتوى'],
  proSkills: [
    'تنسيق المشاريع',
    'كتابة المقترحات ومراجعتها وتدقيقها',
    'التنسيق الإعلامي والعلاقات المؤسسية',
    'الأعمال الإدارية والتنظيمية',
    'تصميم وإنتاج الوسائط المتعددة',
    'صناعة المحتوى الرقمي',
    'العمل ضمن فريق',
    'التنظيم وإدارة المهام',
  ],
  languages: [
    { name: 'العربية', level: 'اللغة الأم' },
    { name: 'الإنجليزية', level: '' },
  ],
  references: 'متاحة عند الطلب',
};

const isStr = (v: unknown, n: number) => typeof v === 'string' && v.length <= n;
const isList = (v: unknown, items: number, n: number) => Array.isArray(v) && v.length <= items && v.every((x) => isStr(x, n));
function isCv(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return (
    ['name', 'title', 'residence', 'birthYear', 'phone', 'email', 'references'].every((k) => isStr(c[k], 300)) &&
    isStr(c.summary, 3000) &&
    ['education', 'experience', 'courses', 'techSkills', 'proSkills'].every((k) => isList(c[k], 40, 300)) &&
    Array.isArray(c.languages) &&
    c.languages.length <= 12 &&
    c.languages.every((l) => l && typeof l === 'object' && isStr((l as Record<string, unknown>).name, 60) && isStr((l as Record<string, unknown>).level, 60))
  );
}

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
  /** 1.1.0: the person using the app (greeting and user card). Empty until they write it in «صفحتي». */
  userName: string;
  userRole: string;
  userOrganization: string;
  cv: CvData;
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
  userName: '',
  userRole: '',
  userOrganization: '',
  cv: DEFAULT_CV,
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
  userName: (v) => typeof v === 'string' && v.length <= 80,
  userRole: (v) => typeof v === 'string' && v.length <= 80,
  userOrganization: (v) => typeof v === 'string' && v.length <= 160,
  cv: isCv,
};

/**
 * The name shown in the greeting and the user card: what the user wrote in «صفحتي»;
 * for data from before 1.1.0, the full name written in the old settings. Never a built-in name.
 */
export const displayName = (s: Pick<Settings, 'userName' | 'ownerFullName'>): string => s.userName.trim() || s.ownerFullName.trim();

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

/** The user's own data in «صفحتي»: kept when the appearance settings are reset. */
export const PROFILE_KEYS: (keyof Settings)[] = ['userName', 'userRole', 'userOrganization', 'cv', 'ownerFullName'];

/** Returns appearance and app settings to their defaults; the profile and the CV are kept. */
export async function resetSettings(database: EduDB): Promise<void> {
  const keys = (await database.settings.toCollection().primaryKeys()) as string[];
  await database.settings.bulkDelete(keys.filter((k) => !PROFILE_KEYS.includes(k as keyof Settings)));
}
