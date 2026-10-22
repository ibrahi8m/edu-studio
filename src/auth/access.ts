import type { Project } from '../db/db';
import { getAuth } from './session';
import { AuthError, hasAccounts } from './local';
import type { CurrentUser } from './types';

/**
 * 1.5.0 — who may see and change which content (one rule, used by the data hooks AND by every write
 * in db/projects.ts and the quiz store, so a hidden button is never the only protection).
 *  - admin: everything;
 *  - teacher: only the content they created (`ownerId`); content from before 1.5.0 belongs to the admin;
 *  - student: read-only, published content (through the learner environment).
 */
export function canSeeProject(p: Pick<Project, 'ownerId' | 'published'> | null | undefined, user: CurrentUser | null = getAuth().user): boolean {
  if (!p || !user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') return p.ownerId === user.id;
  return p.published !== false;
}

export function canEditProject(p: Pick<Project, 'ownerId'> | null | undefined, user: CurrentUser | null = getAuth().user): boolean {
  if (!p || !user) return false;
  return user.role === 'admin' || (user.role === 'teacher' && p.ownerId === user.id);
}

/**
 * In the app (a browser with accounts) every write needs a signed-in account with the right role.
 * Outside the app (the unit tests in Node, no accounts) there is no session to check.
 */
const enforced = () => typeof window !== 'undefined' && hasAccounts();

/** Throws when the signed-in account may not change this content. */
export function assertCanEdit(p: Pick<Project, 'ownerId'> | null | undefined) {
  const user = getAuth().user;
  if (!user && !enforced()) return;
  if (!user) throw new AuthError('انتهت الجلسة. سجّل الدخول من جديد.', 'expired');
  if (!canEditProject(p, user)) throw new AuthError('لا تملك صلاحية تعديل هذا المحتوى.', 'forbidden');
}

/** Throws unless the signed-in account may create content. */
export function assertCanAuthor(): CurrentUser | null {
  const user = getAuth().user;
  if (!user && !enforced()) return null;
  if (!user) throw new AuthError('انتهت الجلسة. سجّل الدخول من جديد.', 'expired');
  if (user.role === 'student') throw new AuthError('حساب الطالب لا يملك صلاحية إنشاء المحتوى.', 'forbidden');
  return user;
}
