import Dexie, { type Table } from 'dexie';

/**
 * Local database (IndexedDB) — one per device. No cloud, no sync.
 * Each phase adds tables through a new numbered Dexie version, so data
 * created by an earlier version is migrated in place, never lost.
 *
 *   v1 (phase 0): settings, meta
 *   v2 (phase 1): projects, lessons
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
export const SCHEMA_VERSION = 2;

export class EduDB extends Dexie {
  settings!: Table<SettingRow, string>;
  meta!: Table<MetaRow, string>;
  projects!: Table<Project, string>;
  lessons!: Table<Lesson, string>;

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
  }
}

export const db = new EduDB();
