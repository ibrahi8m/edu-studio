import type { ItemStatus, ProjectColor } from './db';

export const STATUS_LABEL: Record<ItemStatus, string> = {
  draft: 'مسودة',
  in_progress: 'قيد العمل',
  ready: 'جاهز',
  archived: 'مؤرشف',
};

export const STATUSES: ItemStatus[] = ['draft', 'in_progress', 'ready', 'archived'];

export const STATUS_TONE: Record<ItemStatus, 'neutral' | 'warning' | 'success' | 'accent'> = {
  draft: 'neutral',
  in_progress: 'warning',
  ready: 'success',
  archived: 'neutral',
};

export const GRADES: string[] = [
  'رياض الأطفال',
  'الصف الأول',
  'الصف الثاني',
  'الصف الثالث',
  'الصف الرابع',
  'الصف الخامس',
  'الصف السادس',
  'الصف السابع',
  'الصف الثامن',
  'الصف التاسع',
  'الصف العاشر',
  'الصف الحادي عشر',
  'الصف الثاني عشر',
];

/** 1.6.0: «أخرى» is no longer offered for school content. Content saved with it keeps it until it is edited. */
export const LEGACY_GRADES: string[] = ['أخرى'];

/**
 * 1.5.0: university and teacher training are kinds of content, not school grades. They are no longer in
 * the grade list; these values stay valid because university/training content stores them as its stage
 * (and older projects may still hold them). Nothing stored is changed.
 */
export const KIND_STAGES: string[] = ['التعليم الجامعي', 'تدريب المعلمين'];

/** Suggestions only — the subject field accepts any text. */
export const SUBJECT_SUGGESTIONS: string[] = [
  'اللغة العربية',
  'اللغة الإنجليزية',
  'الرياضيات',
  'العلوم',
  'الفيزياء',
  'الكيمياء',
  'الأحياء',
  'التربية الإسلامية',
  'الدراسات الاجتماعية',
  'التاريخ',
  'الجغرافيا',
  'التكنولوجيا',
  'الحاسوب',
  'التربية الفنية',
  'التربية الرياضية',
];

export const PROJECT_COLORS: { value: ProjectColor; label: string }[] = [
  { value: 'blue', label: 'أزرق كهربائي' },
  { value: 'silver', label: 'فضي' },
  { value: 'teal', label: 'فيروزي' },
  { value: 'violet', label: 'بنفسجي' },
  { value: 'amber', label: 'كهرماني' },
];

export const LIMITS = {
  title: 120,
  subject: 60,
  description: 1000,
  summary: 1000,
  tag: 30,
  tags: 12,
  duration: 600,
};
