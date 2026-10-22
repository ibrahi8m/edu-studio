import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { normalizeQuiz } from './model';
import type { Attempt, Quiz } from './types';
import { useAuth } from '../auth/session';
import { canSeeProject } from '../auth/access';
import type { CurrentUser } from '../auth/types';

/** 1.5.0: the projects this account may see (quizzes and attempts follow their project). */
async function visibleProjectIds(user: CurrentUser | null): Promise<Set<string>> {
  return new Set((await db.projects.toArray()).filter((p) => canSeeProject(p, user)).map((p) => p.id));
}

export function useAllQuizzes(): Quiz[] | undefined {
  const user = useAuth().user;
  return useLiveQuery(async () => {
    const ok = await visibleProjectIds(user);
    return (await db.quizzes.toArray())
      .map(normalizeQuiz)
      .filter((q): q is Quiz => !!q && ok.has(q.projectId));
  }, [user?.id, user?.role]);
}

export function useProjectQuizzes(projectId: string | undefined): Quiz[] | undefined {
  const user = useAuth().user;
  return useLiveQuery(async () => {
    if (!projectId || !(await visibleProjectIds(user)).has(projectId)) return [];
    return (await db.quizzes.where('projectId').equals(projectId).toArray()).map(normalizeQuiz).filter((q): q is Quiz => !!q);
  }, [projectId, user?.id, user?.role]);
}

export function useQuizAttempts(quizId: string | undefined): Attempt[] | undefined {
  const user = useAuth().user;
  return useLiveQuery(async () => {
    if (!quizId) return [];
    const quiz = await db.quizzes.get(quizId);
    if (!quiz || !(await visibleProjectIds(user)).has(quiz.projectId)) return [];
    return db.attempts.where('quizId').equals(quizId).toArray();
  }, [quizId, user?.id, user?.role]);
}

export function useAllAttempts(): Attempt[] | undefined {
  const user = useAuth().user;
  return useLiveQuery(async () => {
    const ok = await visibleProjectIds(user);
    const quizzes = new Set((await db.quizzes.toArray()).filter((q) => ok.has(q.projectId)).map((q) => q.id));
    return (await db.attempts.toArray()).filter((a) => quizzes.has(a.quizId));
  }, [user?.id, user?.role]);
}
