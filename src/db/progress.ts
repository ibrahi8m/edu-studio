import { studentKey } from '../quiz/model';
import type { LessonProgress } from '../student/types';
import type { EduDB, Lesson } from './db';

export const progressId = (name: string, lessonId: string) => `${studentKey(name)}|${lessonId}`;

function blank(name: string, lesson: Pick<Lesson, 'id' | 'projectId'>, now: number): LessonProgress {
  return {
    id: progressId(name, lesson.id),
    studentKey: studentKey(name),
    studentName: name.trim().slice(0, 80),
    lessonId: lesson.id,
    projectId: lesson.projectId,
    visited: [],
    sections: 0,
    current: null,
    activities: {},
    cards: {},
    startedAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export async function getProgress(database: EduDB, name: string, lessonId: string): Promise<LessonProgress | null> {
  if (!name.trim()) return null;
  return (await database.progress.get(progressId(name, lessonId))) ?? null;
}

/** Read-modify-write inside one transaction, so two quick updates never overwrite each other. */
async function change(database: EduDB, name: string, lesson: Pick<Lesson, 'id' | 'projectId'>, fn: (p: LessonProgress) => LessonProgress): Promise<LessonProgress> {
  if (!name.trim()) throw new Error('اكتب اسم الطالب أولًا.');
  return database.transaction('rw', database.progress, async () => {
    const now = Date.now();
    const cur = (await database.progress.get(progressId(name, lesson.id))) ?? blank(name, lesson, now);
    const next = { ...fn(cur), studentName: name.trim().slice(0, 80), updatedAt: Math.max(now, cur.updatedAt) };
    await database.progress.put(next);
    return next;
  });
}

export function visitSection(database: EduDB, name: string, lesson: Pick<Lesson, 'id' | 'projectId'>, sectionId: string, sections: number) {
  return change(database, name, lesson, (p) => ({ ...p, sections, current: sectionId, visited: p.visited.includes(sectionId) ? p.visited : [...p.visited, sectionId] }));
}

export function toggleActivityStep(database: EduDB, name: string, lesson: Pick<Lesson, 'id' | 'projectId'>, blockId: string, step: number) {
  return change(database, name, lesson, (p) => {
    const cur = p.activities[blockId] ?? [];
    const next = cur.includes(step) ? cur.filter((s) => s !== step) : [...cur, step].sort((a, b) => a - b);
    return { ...p, activities: { ...p.activities, [blockId]: next } };
  });
}

export function markCardSeen(database: EduDB, name: string, lesson: Pick<Lesson, 'id' | 'projectId'>, blockId: string, cardId: string) {
  return change(database, name, lesson, (p) => {
    const cur = p.cards[blockId] ?? [];
    return cur.includes(cardId) ? p : { ...p, cards: { ...p.cards, [blockId]: [...cur, cardId] } };
  });
}

export class LessonNotFinishedError extends Error {
  constructor(public missing: number) {
    super(missing === 1 ? 'بقي قسم واحد لم تفتحه بعد.' : `بقيت ${missing} أقسام لم تفتحها بعد.`);
  }
}

/** Marks the lesson finished; refused while some sections were never opened. */
export function completeLesson(database: EduDB, name: string, lesson: Pick<Lesson, 'id' | 'projectId'>, sectionIds: string[]) {
  return change(database, name, lesson, (p) => {
    const missing = sectionIds.filter((s) => !p.visited.includes(s)).length;
    if (missing) throw new LessonNotFinishedError(missing);
    return { ...p, sections: sectionIds.length, completedAt: p.completedAt ?? Date.now() };
  });
}

/** Starts the lesson again: progress is cleared for this student and this lesson only. */
export async function resetProgress(database: EduDB, name: string, lessonId: string): Promise<void> {
  await database.progress.delete(progressId(name, lessonId));
}
