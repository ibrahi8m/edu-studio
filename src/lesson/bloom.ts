import { normalizeArabic } from '../db/search';
import type { BloomLevel, Objective } from './types';

export interface BloomInfo {
  level: BloomLevel;
  name: string;
  /** What the learner does at this level. */
  hint: string;
  verbs: string[];
}

/** Revised Bloom taxonomy (Anderson & Krathwohl, 2001), with measurable Arabic verbs. */
export const BLOOM: BloomInfo[] = [
  {
    level: 1,
    name: 'التذكر',
    hint: 'استرجاع المعلومات والحقائق',
    verbs: ['يعدّد', 'يسمّي', 'يذكر', 'يعرّف', 'يحدّد', 'يسرد', 'يسترجع', 'يتعرّف على', 'يطابق', 'يُكمل'],
  },
  {
    level: 2,
    name: 'الفهم',
    hint: 'بناء المعنى وشرح الأفكار',
    verbs: ['يشرح', 'يفسّر', 'يلخّص', 'يصنّف', 'يوضّح', 'يصف', 'يعيد صياغة', 'يعطي أمثلة على', 'يترجم', 'يستنتج'],
  },
  {
    level: 3,
    name: 'التطبيق',
    hint: 'استخدام المعرفة في مواقف جديدة',
    verbs: ['يطبّق', 'يستخدم', 'يحلّ', 'ينفّذ', 'يحسب', 'يوظّف', 'يُجري', 'يرسم', 'يُعدّ', 'يُثبت'],
  },
  {
    level: 4,
    name: 'التحليل',
    hint: 'تفكيك الكل إلى أجزائه والعلاقات بينها',
    verbs: ['يحلّل', 'يقارن', 'يميّز', 'يفرّق بين', 'يربط', 'ينظّم', 'يرتّب', 'يفكّك', 'يستخلص', 'يختبر'],
  },
  {
    level: 5,
    name: 'التقويم',
    hint: 'إصدار أحكام وفق معايير',
    verbs: ['يقيّم', 'ينقد', 'يحكم على', 'يبرّر', 'يدافع عن', 'يفاضل بين', 'يتحقق من', 'يدعم', 'يوصي', 'يثمّن'],
  },
  {
    level: 6,
    name: 'الإبداع',
    hint: 'إنتاج عمل جديد أو أصيل',
    verbs: ['يصمّم', 'يبتكر', 'يؤلّف', 'ينتج', 'يخطّط', 'يقترح', 'يطوّر', 'يبني', 'يركّب', 'يعيد تنظيم'],
  },
];

/** Internal states that cannot be observed or measured directly. */
export const NON_MEASURABLE = ['يعرف', 'يفهم', 'يدرك', 'يتعلم', 'يستوعب', 'يقدر', 'يتذوق', 'يلم', 'يتذكر', 'يعي', 'يؤمن', 'يحب', 'يهتم', 'يتقن', 'يلاحظ'];

const VERB_LEVEL = new Map<string, BloomLevel>();
for (const b of BLOOM) for (const v of b.verbs) VERB_LEVEL.set(normalizeArabic(v), b.level);

export function bloomInfo(level: BloomLevel | 0): BloomInfo | undefined {
  return BLOOM.find((b) => b.level === level);
}

/** Finds the Bloom level of a verb from the bank (ignores diacritics and hamza spelling). */
export function detectLevel(verb: string): BloomLevel | 0 {
  return VERB_LEVEL.get(normalizeArabic(verb)) ?? 0;
}

export function isNonMeasurable(verb: string): boolean {
  const v = normalizeArabic(verb).split(' ')[0];
  return NON_MEASURABLE.some((n) => normalizeArabic(n) === v);
}

/** «أن يعدّد الطالب ثلاثة مصادر للطاقة بعد مشاهدة الفيديو بدقة تامة.» */
export function objectiveStatement(o: Objective, audience = 'الطالب'): string {
  const parts = [o.verb.trim(), (audience || 'الطالب').trim(), o.content.trim(), o.condition.trim(), o.criterion.trim()].filter(Boolean);
  if (!o.verb.trim() && !o.content.trim()) return '';
  return `أن ${parts.join(' ')}`.replace(/\s+/g, ' ').trim().replace(/[.。]?$/, '.');
}

export type CheckLevel = 'ok' | 'warn' | 'error';

export interface ObjectiveCheck {
  level: CheckLevel;
  messages: { level: CheckLevel; text: string }[];
}

/** Checks an objective against ABCD: measurable verb, content, condition, criterion. */
export function checkObjective(o: Objective): ObjectiveCheck {
  const messages: ObjectiveCheck['messages'] = [];
  if (!o.verb.trim()) messages.push({ level: 'error', text: 'اختر فعلًا سلوكيًا قابلًا للقياس.' });
  else if (isNonMeasurable(o.verb)) messages.push({ level: 'error', text: `الفعل «${o.verb.trim()}» يصف حالة داخلية لا يمكن ملاحظتها؛ استبدله بفعل من بنك الأفعال.` });
  if (!o.content.trim()) messages.push({ level: 'error', text: 'اكتب المحتوى الذي سيؤديه الطالب.' });
  if (!o.level) messages.push({ level: 'warn', text: 'حدّد مستوى بلوم للهدف.' });
  else {
    const found = detectLevel(o.verb);
    if (found && found !== o.level)
      messages.push({ level: 'warn', text: `الفعل «${o.verb.trim()}» مصنّف في بنك الأفعال ضمن مستوى ${bloomInfo(found)!.name}.` });
  }
  if (!o.criterion.trim()) messages.push({ level: 'warn', text: 'أضف معيار الأداء المقبول (مثل: بدقة 90٪، دون أخطاء، خلال 5 دقائق).' });
  if (!o.condition.trim()) messages.push({ level: 'warn', text: 'يمكنك إضافة شرط الأداء (مثل: بعد مشاهدة الفيديو، باستخدام الخريطة).' });
  const level: CheckLevel = messages.some((m) => m.level === 'error') ? 'error' : messages.length ? 'warn' : 'ok';
  return { level, messages };
}
