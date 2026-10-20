import {
  BarChart3,
  BookOpen,
  DatabaseBackup,
  FolderKanban,
  LayoutDashboard,
  Library,
  ListChecks,
  MonitorPlay,
  Palette,
  Settings,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

export type NavGroup = 'main' | 'authoring' | 'delivery' | 'management';

export interface NavItem {
  path: string;
  label: string;
  short: string;
  icon: LucideIcon;
  group: NavGroup;
  /** Phase in the foundation plan that builds this screen. */
  phase: number;
  /** Shown in the phone's bottom bar. */
  mobilePrimary?: boolean;
}

export const NAV: NavItem[] = [
  { path: '/', label: 'لوحة التحكم', short: 'الرئيسية', icon: LayoutDashboard, group: 'main', phase: 0, mobilePrimary: true },
  { path: '/projects', label: 'المشاريع والدروس', short: 'المشاريع', icon: FolderKanban, group: 'authoring', phase: 1, mobilePrimary: true },
  { path: '/builder', label: 'منشئ الدروس', short: 'الدروس', icon: BookOpen, group: 'authoring', phase: 2 },
  { path: '/studio', label: 'استوديو التصميم', short: 'الاستوديو', icon: Palette, group: 'authoring', phase: 5 },
  { path: '/quizzes', label: 'منشئ الاختبارات', short: 'الاختبارات', icon: ListChecks, group: 'authoring', phase: 3 },
  { path: '/student', label: 'وضع الطالب', short: 'الطالب', icon: MonitorPlay, group: 'delivery', phase: 3, mobilePrimary: true },
  { path: '/results', label: 'النتائج والتحليلات', short: 'النتائج', icon: BarChart3, group: 'delivery', phase: 3, mobilePrimary: true },
  { path: '/library', label: 'المكتبة المحلية', short: 'المكتبة', icon: Library, group: 'management', phase: 6 },
  { path: '/backup', label: 'الاستيراد والتصدير', short: 'النسخ', icon: DatabaseBackup, group: 'management', phase: 6 },
  { path: '/settings', label: 'الإعدادات', short: 'الإعدادات', icon: Settings, group: 'management', phase: 0 },
  { path: '/about', label: 'عن صاحب المشروع', short: 'عنّي', icon: UserRound, group: 'management', phase: 0 },
];

export const GROUP_LABEL: Record<NavGroup, string> = {
  main: '',
  authoring: 'التأليف',
  delivery: 'التقديم للطالب',
  management: 'الإدارة',
};

export const PHASES: { n: number; title: string }[] = [
  { n: 0, title: 'الأساس دون اتصال' },
  { n: 1, title: 'البيانات والمشاريع' },
  { n: 2, title: 'منشئ الدروس' },
  { n: 3, title: 'الاختبارات والتصحيح' },
  { n: 4, title: 'مسار الطالب في الدروس' },
  { n: 5, title: 'استوديو التصميم' },
  { n: 6, title: 'المكتبة والنسخ' },
  { n: 7, title: 'الهوية والمحتوى التجريبي' },
  { n: 8, title: 'التغليف والتسليم' },
];

export const CURRENT_PHASE = 3;
