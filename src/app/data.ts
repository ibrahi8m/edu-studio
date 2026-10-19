import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Lesson, type Project } from '../db/db';
import { listLessons } from '../db/projects';

/** Live views over the local database: components re-render when data changes. */
export function useAllProjects(): Project[] | undefined {
  return useLiveQuery(() => db.projects.toArray(), []);
}

export function useAllLessons(): Lesson[] | undefined {
  return useLiveQuery(() => db.lessons.toArray(), []);
}

export function useProject(id: string | undefined): Project | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.projects.get(id)) ?? null) : null), [id]);
}

export function useProjectLessons(id: string | undefined): Lesson[] | undefined {
  return useLiveQuery(() => (id ? listLessons(db, id) : Promise.resolve([] as Lesson[])), [id]);
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return 'تعذّر الحفظ في قاعدة البيانات المحلية.';
}
