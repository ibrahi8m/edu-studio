import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Lesson, type Project } from '../db/db';
import { normalizeDoc } from '../lesson/model';
import type { LessonDoc } from '../lesson/types';
import { countable, countedAttempt } from '../quiz/analytics';
import { normalizeQuiz, quizReadiness, studentKey } from '../quiz/model';
import type { Attempt, Quiz } from '../quiz/types';
import { summarizeProgress, type ProgressSummary } from './sections';
import type { LessonProgress } from './types';
import { isPublished, kindOf } from '../db/contentKinds';
import { getLearner } from '../learner/db';
import { CONTENT_FOR, type LearnerProfile, type Submission } from '../learner/types';

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
  /** 1.1.0: the learner's profile (null = not saved yet: treated as a school student). */
  profile: LearnerProfile | null;
  /** Published content of the learner's kind, for choosing what they are enrolled in. */
  available: Project[];
  submissions: Submission[];
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
    const [projects, lessons, rawQuizzes, mine, progress, profile, submissions] = await Promise.all([
      db.projects.toArray(),
      db.lessons.toArray(),
      db.quizzes.toArray(),
      key ? db.attempts.filter((a) => a.studentKey === key && !a.preview).toArray() : Promise.resolve([] as Attempt[]),
      key ? db.progress.where('studentKey').equals(key).toArray() : Promise.resolve([] as LessonProgress[]),
      getLearner(db, name),
      key ? db.submissions.where('studentKey').equals(key).toArray() : Promise.resolve([] as Submission[]),
    ]);
    // Only published content of the learner's kind; if they chose courses, only those.
    const want = CONTENT_FOR[profile?.type ?? 'school'];
    const available = projects.filter((p) => p.status !== 'archived' && isPublished(p) && kindOf(p) === want);
    const assigned = new Set(profile?.assigned ?? []);
    const visible = assigned.size ? available.filter((p) => assigned.has(p.id)) : available;
    const docs = await db.lessonDocs.bulkGet(lessons.map((l) => l.id));
    const quizzes = rawQuizzes.map(normalizeQuiz).filter((q): q is Quiz => !!q && quizReadiness(q).ready);
    const lessonIds = new Set(lessons.map((l) => l.id));
    const groups = visible
      .slice()
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
    return { groups, profile, available, submissions };
  }, [name]);
}
