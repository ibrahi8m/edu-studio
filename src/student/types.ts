/** Phase 4: a student's progress through a lesson, stored in the `progress` table (one row per student and lesson). */
export interface LessonProgress {
  /** `${studentKey}|${lessonId}` */
  id: string;
  /** Normalised student name (same key as quiz attempts). */
  studentKey: string;
  studentName: string;
  lessonId: string;
  projectId: string;
  /** Ids of the lesson sections the student has opened. */
  visited: string[];
  /** Number of sections in the lesson the last time it was opened (for lists that do not load the lesson). */
  sections: number;
  /** Section the student was on, to resume there. */
  current: string | null;
  /** Activity block id → indexes of the steps the student ticked. */
  activities: Record<string, number[]>;
  /** Cards block id → ids of the cards the student turned over. */
  cards: Record<string, string[]>;
  startedAt: number;
  updatedAt: number;
  /** Set when the student finished the lesson after opening every section. */
  completedAt: number | null;
}
