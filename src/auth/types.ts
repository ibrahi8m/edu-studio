/** 1.5.0 — accounts and roles. */

export type Role = 'admin' | 'teacher' | 'student';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'صاحب المشروع (الأدمن)',
  teacher: 'معلم',
  student: 'طالب',
};

/** 1.6.0: the portal each role works in (shown in the shell). */
export const PORTAL_LABEL: Record<Role, string> = {
  admin: 'بوابة الإدارة',
  teacher: 'بوابة المعلم',
  student: 'بوابة الطالب',
};

export type AuthMode = 'local' | 'cloud';

/** The signed-in user, whatever the mode. */
export interface CurrentUser {
  id: string;
  /** Local: the user name. Cloud: the e-mail. */
  login: string;
  displayName: string;
  role: Role;
  mode: AuthMode;
  /** Students: the learner profile name their progress, attempts and assignments are stored under. */
  learnerName?: string;
}

/** Where each role may go. Checked by the route guard and again by every protected operation. */
export function canAccess(role: Role, path: string): boolean {
  const p = path.replace(/^#/, '').split('?')[0] || '/';
  const starts = (...xs: string[]) => xs.some((x) => p === x || p.startsWith(`${x}/`));
  if (starts('/account', '/about', '/login', '/setup')) return true;
  if (role === 'admin') return true;
  if (role === 'student') return starts('/learn', '/take');
  // teacher: authoring, delivery and the owner page (read only); no users, backup or general settings
  return !starts('/users', '/backup', '/settings');
}

/** The portal each role lands on after signing in. */
export const homeFor = (role: Role): string => (role === 'student' ? '/learn' : '/');
