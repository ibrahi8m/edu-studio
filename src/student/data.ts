import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Lesson, type Project } from '../db/db';
import { normalizeDoc } from '../lesson/model';
import type { LessonDoc } from '../lesson/types';
import { countable, countedAttempt } from '../quiz/analytics';
import { normalizeQuiz, quizReadiness, studentKey } from '../quiz/model';
import type { Attempt, Quiz } from '../quiz/types';
import { summarizeProgress, type ProgressSummary } from './sections';
import type { LessonProgress } from './types';

export interface MyQuiz {
  quiz: Quiz;
  /** This student's real, submitted attempts, oldest first. */
  done: Attempt[];
  open: Attempt | null;
  counted: Attempt | null;
  limitReached: boolean;
}

export interface MyLesson {
  lesson: Lesson;
  doc: LessonDoc;
  progress: LessonProgress | null;
  summary: ProgressSummary;
  quizzes: MyQuiz[];
}

export interface LearnData {
  groups: { project: Project; lessons: MyLesson[]; quizzes: MyQuiz[] }[];
}

export function myQuiz(quiz: Quiz, mine: Attempt[]): MyQuiz {
  const done = countable(mine.filter((a) => a.quizId === quiz.id)).sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));
  const open = mine.filter((a) => a.quizId === quiz.id && a.status === 'in_progress' && !a.preview).sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
  return {
    quiz,
    done,
    open,
    counted: countedAttempt(done, quiz.settings.scorePolicy),
    limitReached: !open && quiz.settings.maxAttempts > 0 && done.length >= quiz.settings.maxAttempts,
  };
}

/** Everything student mode lists, with this student's own progress and attempts only. */
export function useLearnData(name: string): LearnData | undefined {
  return useLiveQuery(async () => {
    const key = studentKey(name);
    const [projects, lessons, rawQuizzes, mine, progress] = await Promise.all([
      db.projects.toArray(),
      db.lessons.toArray(),
      db.quizzes.toArray(),
      key ? db.attempts.filter((a) => a.studentKey === key && !a.preview).toArray() : Promise.resolve([] as Attempt[]),
      key ? db.progress.where('studentKey').equals(key).toArray() : Promise.resolve([] as LessonProgress[]),
    ]);
    const docs = await db.lessonDocs.bulkGet(lessons.map((l) => l.id));
    const quizzes = rawQuizzes.map(normalizeQuiz).filter((q): q is Quiz => !!q && quizReadiness(q).ready);
    const lessonIds = new Set(lessons.map((l) => l.id));
    const groups = projects
      .filter((p) => p.status !== 'archived')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((project) => {
        const ls = lessons
          .map((lesson, i) => ({ lesson, doc: normalizeDoc(docs[i], lesson.id) }))
          .filter((x) => x.lesson.projectId === project.id)
          .sort((a, b) => a.lesson.order - b.lesson.order)
          .map(({ lesson, doc }) => {
            const p = progress.find((x) => x.lessonId === lesson.id) ?? null;
            return {
              lesson,
              doc,
              progress: p,
              summary: summarizeProgress(doc, p),
              quizzes: quizzes
                .filter((z) => z.lessonId === lesson.id)
                .sort((a, b) => a.title.localeCompare(b.title, 'ar'))
                .map((z) => myQuiz(z, mine)),
            };
          });
        const general = quizzes
          .filter((z) => z.projectId === project.id && (!z.lessonId || !lessonIds.has(z.lessonId)))
          .sort((a, b) => a.title.localeCompare(b.title, 'ar'))
          .map((z) => myQuiz(z, mine));
        return { project, lessons: ls, quizzes: general };
      })
      .filter((g) => g.lessons.length || g.quizzes.length);
    return { groups };
  }, [name]);
}
