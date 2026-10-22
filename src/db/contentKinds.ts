import type { ContentKind, Project } from './db';

/**
 * 1.1.0: the three kinds of educational content and the fields each one asks for.
 * Common fields live on the project itself (title → `title`, subject/course/topic → `subject`,
 * grade → `grade`, description → `description`); the kind-specific ones live in `project.details`.
 */
export interface KindField {
  key: string;
  label: string;
  multiline?: boolean;
  options?: string[];
  /** Options no longer offered but still accepted, so values saved earlier are never dropped. */
  legacyOptions?: string[];
  placeholder?: string;
  max: number;
}

export interface KindSpec {
  kind: ContentKind;
  label: string;
  short: string;
  hint: string;
  /** Label of the project's `title` and `subject` for this kind. */
  titleLabel: string;
  subjectLabel: string;
  /** 1.5.0: hint for the subject/course/topic field (free text for university and training). */
  subjectPlaceholder: string;
  /** Whether the school subject list is suggested for the subject field (school content only). */
  schoolSubjects: boolean;
  /** Whether the grade (school stage) list is shown. */
  usesGrade: boolean;
  /** Grade stored for kinds that do not show the list, so older filters keep working. */
  fixedGrade?: string;
  unitLabel: string;
  lessonLabel: string;
  fields: KindField[];
}

export const KIND_SPECS: Record<ContentKind, KindSpec> = {
  school: {
    kind: 'school',
    label: 'محتوى مدرسي',
    short: 'مدرسي',
    hint: 'دروس لصف ومادة وفصل دراسي',
    titleLabel: 'عنوان المحتوى',
    subjectLabel: 'المادة',
    subjectPlaceholder: 'اختر أو اكتب',
    schoolSubjects: true,
    usesGrade: true,
    unitLabel: 'الوحدة',
    lessonLabel: 'الدرس',
    fields: [
      // 1.5.0: «العام كاملًا» removed at the owner's request; a value saved earlier is kept.
      { key: 'semester', label: 'الفصل الدراسي', options: ['الفصل الأول', 'الفصل الثاني', 'الفصل الصيفي'], legacyOptions: ['العام كاملًا'], max: 40 },
      { key: 'objectives', label: 'الأهداف العامة', multiline: true, placeholder: 'هدف في كل سطر', max: 3000 },
    ],
  },
  university: {
    kind: 'university',
    label: 'محتوى جامعي',
    short: 'جامعي',
    hint: 'مساق جامعي بموضوعات ومراجع',
    titleLabel: 'عنوان المحتوى',
    subjectLabel: 'اسم المساق',
    subjectPlaceholder: 'اكتب اسم المساق، مثل: مناهج البحث التربوي، تصميم التعليم، الإحصاء المتقدم',
    schoolSubjects: false,
    usesGrade: false,
    fixedGrade: 'التعليم الجامعي',
    unitLabel: 'الوحدة أو الموضوع',
    lessonLabel: 'المحاضرة أو الموضوع',
    fields: [
      { key: 'specialization', label: 'التخصص', max: 120 },
      { key: 'degree', label: 'الدرجة العلمية', options: ['بكالوريوس', 'ماجستير', 'دكتوراه'], max: 20 },
      { key: 'level', label: 'المستوى الأكاديمي', placeholder: 'مثل: السنة الثانية، أو الفصل الأول من البرنامج', max: 120 },
      { key: 'objectives', label: 'الأهداف', multiline: true, placeholder: 'هدف في كل سطر', max: 3000 },
      { key: 'references', label: 'المصادر والمراجع', multiline: true, placeholder: 'مرجع في كل سطر', max: 4000 },
    ],
  },
  training: {
    kind: 'training',
    label: 'برنامج تدريب معلمين',
    short: 'تدريب معلمين',
    hint: 'برنامج تدريبي بمحاور وأنشطة وتقييم',
    titleLabel: 'عنوان البرنامج',
    subjectLabel: 'موضوع التدريب',
    subjectPlaceholder: 'اكتب موضوع التدريب، مثل: التعلم النشط، التقويم البديل، دمج التكنولوجيا في التعليم',
    schoolSubjects: false,
    usesGrade: false,
    fixedGrade: 'تدريب المعلمين',
    unitLabel: 'المحور',
    lessonLabel: 'الجلسة التدريبية',
    fields: [
      { key: 'targetTeachers', label: 'الفئة المستهدفة من المعلمين', placeholder: 'مثل: معلمو العلوم للمرحلة الأساسية', max: 200 },
      { key: 'duration', label: 'مدة البرنامج', placeholder: 'مثل: 3 أيام، 12 ساعة تدريبية', max: 80 },
      { key: 'objectives', label: 'الأهداف التدريبية', multiline: true, placeholder: 'هدف في كل سطر', max: 3000 },
      { key: 'axes', label: 'محاور التدريب', multiline: true, placeholder: 'محور في كل سطر', max: 3000 },
      { key: 'activities', label: 'الأنشطة والتقييمات', multiline: true, placeholder: 'نشاط أو أداة تقييم في كل سطر', max: 3000 },
    ],
  },
};

export const CONTENT_KINDS: ContentKind[] = ['school', 'university', 'training'];

export const kindOf = (p: Pick<Project, 'kind'> | null | undefined): ContentKind => (p?.kind && CONTENT_KINDS.includes(p.kind) ? p.kind : 'school');
export const isPublished = (p: Pick<Project, 'published'> | null | undefined): boolean => p?.published !== false;

/** Keeps only the fields the kind defines, trimmed to their limits. */
export function cleanDetails(kind: ContentKind, raw: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const f of KIND_SPECS[kind].fields) {
    const v = raw[f.key];
    if (typeof v !== 'string') continue;
    const t = v.trim().slice(0, f.max);
    if (!t) continue;
    if (f.options && !f.options.includes(t) && !f.legacyOptions?.includes(t)) continue;
    out[f.key] = t;
  }
  return out;
}

/** Lines of a multi-line detail (objectives, references, axes…). */
export const detailLines = (p: Pick<Project, 'details'>, key: string): string[] =>
  (p.details?.[key] ?? '')
    .split('\n')
    .map((s) => s.replace(/^[-•\d.)\s]+/, '').trim())
    .filter(Boolean);

/** A one-line description of the content's audience (grade, degree, target teachers). */
export function audienceLine(p: Project): string {
  const k = kindOf(p);
  const d = p.details ?? {};
  if (k === 'school') return [p.subject, p.grade, d.semester].filter(Boolean).join(' · ');
  if (k === 'university') return [p.subject, d.specialization, d.degree, d.level].filter(Boolean).join(' · ');
  return [p.subject, d.targetTeachers, d.duration].filter(Boolean).join(' · ');
}
