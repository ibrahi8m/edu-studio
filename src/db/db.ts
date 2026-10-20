import Dexie, { type Table } from 'dexie';
import type { Asset, LessonDoc } from '../lesson/types';
import type { Attempt, Quiz } from '../quiz/types';
import type { LessonProgress } from '../student/types';
import type { Design } from '../studio/types';

/**
 * Local database (IndexedDB) — one per device. No cloud, no sync.
 * Each phase adds tables through a new numbered Dexie version, so data
 * created by an earlier version is migrated in place, never lost.
 *
 *   v1 (phase 0): settings, meta
 *   v2 (phase 1): projects, lessons
 *   v3 (phase 2): lessonDocs (objectives, plan, content blocks), assets (local media)
 *   v4 (phase 3): quizzes (questions and settings), attempts (student answers and results)
 *   v5 (phase 4): progress (each student's progress through each lesson)
 *   v6 (phase 5): designs (studio: cards, visual summaries, concept maps)
 */
export interface SettingRow {
  key: string;
  value: unknown;
  updatedAt: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export type ItemStatus = 'draft' | 'in_progress' | 'ready' | 'archived';

export interface Project {
  id: string;
  title: string;
  subject: string;
  grade: string;
  description: string;
  status: ItemStatus;
  tags: string[];
  color: ProjectColor;
  createdAt: number;
  updatedAt: number;
}

export type ProjectColor = 'blue' | 'silver' | 'teal' | 'violet' | 'amber';

export interface Lesson {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  /** Planned duration in minutes (0 = not set). */
  duration: number;
  status: ItemStatus;
  tags: string[];
  order: number;
  createdAt: number;
  updatedAt: number;
}

export const DB_NAME = 'ibrahi8m-edu';
export const SCHEMA_VERSION = 6;

export class EduDB extends Dexie {
  settings!: Table<SettingRow, string>;
  meta!: Table<MetaRow, string>;
  projects!: Table<Project, string>;
  lessons!: Table<Lesson, string>;
  lessonDocs!: Table<LessonDoc, string>;
  assets!: Table<Asset, string>;
  quizzes!: Table<Quiz, string>;
  attempts!: Table<Attempt, string>;
  progress!: Table<LessonProgress, string>;
  designs!: Table<Design, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores({
      settings: 'key',
      meta: 'key',
    });
    this.version(2).stores({
      projects: 'id, updatedAt, createdAt, title, subject, grade, status, *tags',
      lessons: 'id, projectId, [projectId+order], updatedAt, status, *tags',
    });
    // Adds tables only: existing projects, lessons and settings are untouched.
    this.version(3).stores({
      lessonDocs: 'lessonId, updatedAt',
      assets: 'id, lessonId, kind, createdAt',
    });
    // Adds tables only: everything from v1–v3 is untouched.
    this.version(4).stores({
      quizzes: 'id, projectId, lessonId, updatedAt',
      attempts: 'id, quizId, [quizId+studentKey], status, submittedAt',
    });
    // Adds one table only: everything from v1–v4 is untouched.
    this.version(5).stores({
      progress: 'id, studentKey, lessonId, projectId, updatedAt',
    });
    // Adds one table only: everything from v1–v5 is untouched.
    this.version(6).stores({
      designs: 'id, projectId, lessonId, kind, updatedAt',
    });
  }
}

export const db = new EduDB();
