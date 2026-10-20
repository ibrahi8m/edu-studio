import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { normalizeQuiz } from './model';
import type { Attempt, Quiz } from './types';

export function useAllQuizzes(): Quiz[] | undefined {
  return useLiveQuery(async () => (await db.quizzes.toArray()).map(normalizeQuiz).filter((q): q is Quiz => !!q), []);
}

export function useProjectQuizzes(projectId: string | undefined): Quiz[] | undefined {
  return useLiveQuery(
    async () => (projectId ? (await db.quizzes.where('projectId').equals(projectId).toArray()).map(normalizeQuiz).filter((q): q is Quiz => !!q) : []),
    [projectId],
  );
}

export function useQuizAttempts(quizId: string | undefined): Attempt[] | undefined {
  return useLiveQuery(async () => (quizId ? db.attempts.where('quizId').equals(quizId).toArray() : []), [quizId]);
}

export function useAllAttempts(): Attempt[] | undefined {
  return useLiveQuery(() => db.attempts.toArray(), []);
}
