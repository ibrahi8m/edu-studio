import type { BlockType, Grouping, SummaryStyle } from './types';

export interface Option {
  id: string;
  label: string;
  hint?: string;
}

export const STRATEGIES: Option[] = [
  { id: 'direct', label: 'التدريس المباشر', hint: 'شرح منظم ثم تطبيق موجّه ومستقل' },
  { id: 'cooperative', label: 'التعلم التعاوني', hint: 'مجموعات صغيرة بأدوار محددة وهدف مشترك' },
  { id: 'discovery', label: 'التعلم بالاكتشاف', hint: 'يصل الطالب إلى المفهوم بنفسه عبر الاستقصاء' },
  { id: 'inquiry', label: 'الاستقصاء', hint: 'طرح سؤال وجمع الأدلة واستخلاص النتائج' },
  { id: 'problem', label: 'حل المشكلات', hint: 'مشكلة حقيقية تقود عملية التعلم' },
  { id: 'project', label: 'التعلم القائم على المشروعات', hint: 'إنتاج عمل متكامل خلال مدة زمنية' },
  { id: 'flipped', label: 'الصف المقلوب', hint: 'المحتوى في البيت والتطبيق في الصف' },
  { id: 'brainstorm', label: 'العصف الذهني', hint: 'توليد أكبر عدد من الأفكار دون نقد' },
  { id: 'discussion', label: 'المناقشة والحوار', hint: 'أسئلة موجّهة وتبادل للآراء' },
  { id: 'roleplay', label: 'لعب الأدوار', hint: 'محاكاة مواقف حقيقية' },
  { id: 'games', label: 'التعلم باللعب', hint: 'ألعاب تعليمية مرتبطة بالأهداف' },
  { id: 'self', label: 'التعلم الذاتي', hint: 'يتقدم الطالب وفق سرعته' },
  { id: 'differentiated', label: 'التعليم المتمايز', hint: 'تنويع المحتوى والعملية والناتج حسب الفروق الفردية' },
];

export const ASSESSMENT_TYPES: Option[] = [
  { id: 'diagnostic', label: 'قبلي / تشخيصي', hint: 'قبل الدرس لمعرفة المعرفة السابقة' },
  { id: 'formative', label: 'تكويني', hint: 'أثناء الدرس لتعديل التعليم' },
  { id: 'summative', label: 'ختامي', hint: 'في نهاية الدرس أو الوحدة' },
  { id: 'self', label: 'ذاتي', hint: 'يقيّم الطالب نفسه' },
  { id: 'peer', label: 'تقييم الأقران', hint: 'يقيّم الطلاب بعضهم' },
];

export const ASSESSMENT_TOOLS: Option[] = [
  { id: 'quiz', label: 'اختبار قصير' },
  { id: 'oral', label: 'أسئلة شفوية' },
  { id: 'observation', label: 'الملاحظة' },
  { id: 'checklist', label: 'قائمة رصد' },
  { id: 'rubric', label: 'سلّم تقدير' },
  { id: 'exit', label: 'بطاقة خروج' },
  { id: 'portfolio', label: 'ملف إنجاز' },
  { id: 'task', label: 'مهمة أداء' },
  { id: 'project', label: 'مشروع' },
];

export function optionLabel(list: Option[], id: string): string {
  return list.find((o) => o.id === id)?.label ?? id;
}

export const GROUPING_LABEL: Record<Grouping, string> = {
  individual: 'فردي',
  pairs: 'ثنائيات',
  groups: 'مجموعات',
  class: 'الصف كاملًا',
};

export const SUMMARY_STYLE_LABEL: Record<SummaryStyle, string> = {
  grid: 'بطاقات',
  steps: 'خطوات متسلسلة',
  central: 'مفهوم مركزي',
};

export interface BlockMeta {
  type: BlockType;
  label: string;
  hint: string;
  /** Content explains; practice makes the learner do something. */
  role: 'structure' | 'content' | 'practice';
}

export const BLOCK_META: Record<BlockType, BlockMeta> = {
  heading: { type: 'heading', label: 'عنوان', hint: 'عنوان قسم داخل الدرس', role: 'structure' },
  text: { type: 'text', label: 'نص', hint: 'فقرات وقوائم وشرح', role: 'content' },
  image: { type: 'image', label: 'صورة', hint: 'صورة محلية مع نص بديل', role: 'content' },
  audio: { type: 'audio', label: 'صوت', hint: 'ملف صوتي مع نص مكتوب', role: 'content' },
  video: { type: 'video', label: 'فيديو', hint: 'فيديو محلي مع وصف', role: 'content' },
  cards: { type: 'cards', label: 'بطاقات تعليمية', hint: 'وجه وظهر للمراجعة والتذكر', role: 'practice' },
  summary: { type: 'summary', label: 'ملخص بصري', hint: 'نقاط رئيسية في شكل بصري', role: 'content' },
  activity: { type: 'activity', label: 'نشاط تعليمي', hint: 'مهمة يؤديها الطالب بخطوات', role: 'practice' },
};

export const BLOCK_ORDER: BlockType[] = ['heading', 'text', 'image', 'video', 'audio', 'summary', 'cards', 'activity'];

export const MEDIA_LIMITS = {
  imageInputBytes: 30 * 1024 * 1024,
  imageMaxSide: 1600,
  audioBytes: 50 * 1024 * 1024,
  videoBytes: 150 * 1024 * 1024,
};
