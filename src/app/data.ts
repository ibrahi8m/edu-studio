import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Lesson, type Project } from '../db/db';
import { listLessons } from '../db/projects';
import { useAuth } from '../auth/session';
import { canSeeProject } from '../auth/access';

/** Live views over the local database: components re-render when data changes. */
// 1.5.0: every list goes through the account's visibility rule (src/auth/access.ts).
export function useAllProjects(): Project[] | undefined {
  const user = useAuth().user;
  return useLiveQuery(async () => (await db.projects.toArray()).filter((p) => canSeeProject(p, user)), [user?.id, user?.role]);
}

export function useAllLessons(): Lesson[] | undefined {
  const user = useAuth().user;
  return useLiveQuery(async () => {
    const [projects, lessons] = await Promise.all([db.projects.toArray(), db.lessons.toArray()]);
    const ok = new Set(projects.filter((p) => canSeeProject(p, user)).map((p) => p.id));
    return lessons.filter((l) => ok.has(l.projectId));
  }, [user?.id, user?.role]);
}

/** null = missing OR not visible to this account (the page shows «غير موجود»). */
export function useProject(id: string | undefined): Project | null | undefined {
  const user = useAuth().user;
  return useLiveQuery(async () => {
    const p = id ? ((await db.projects.get(id)) ?? null) : null;
    return p && canSeeProject(p, user) ? p : null;
  }, [id, user?.id, user?.role]);
}

export function useProjectLessons(id: string | undefined): Lesson[] | undefined {
  const user = useAuth().user;
  return useLiveQuery(async () => {
    const p = id ? await db.projects.get(id) : undefined;
    return p && canSeeProject(p, user) ? listLessons(db, p.id) : ([] as Lesson[]);
  }, [id, user?.id, user?.role]);
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return 'تعذّر الحفظ في قاعدة البيانات المحلية.';
}
