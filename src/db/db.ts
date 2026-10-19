import Dexie, { type Table } from 'dexie';

/**
 * Local database (IndexedDB) — one per device. No cloud, no sync.
 * Phase 0 defines only what it uses; later phases add tables through
 * numbered Dexie versions so existing data is migrated, never lost.
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

export const DB_NAME = 'ibrahi8m-edu';
export const SCHEMA_VERSION = 1;

export class EduDB extends Dexie {
  settings!: Table<SettingRow, string>;
  meta!: Table<MetaRow, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores({
      settings: 'key',
      meta: 'key',
    });
  }
}

export const db = new EduDB();
