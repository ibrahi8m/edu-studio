/**
 * The IBRAHI8M file format (.ibm) — documented in docs/FILE-FORMAT.md.
 *
 * A ZIP archive with:
 *   manifest.json   what the file is: format, version, kind (project | backup), counts, checksums
 *   data.json       the records (projects, lessons, lesson content, quizzes, designs, …)
 *   assets/<id>     each media file as raw bytes, its SHA-256 listed in the manifest
 *
 * Records keep the exact shape of the local database tables, so an export from any
 * version can be read by later versions (missing tables or fields fall back to defaults).
 */
import type { Lesson, Project, SettingRow } from '../db/db';
import type { Asset, LessonDoc } from '../lesson/types';
import type { LibraryItem } from '../library/types';
import type { Attempt, Quiz } from '../quiz/types';
import type { LessonProgress } from '../student/types';
import type { Design } from '../studio/types';

export const FORMAT = 'ibrahi8m-edu';
/** Bump only for changes older readers cannot understand. */
export const FORMAT_VERSION = 1;
export const EXTENSION = '.ibm';
export const MIME = 'application/vnd.ibrahi8m+zip';

/** Files above this are refused before reading (memory on phones). */
export const MAX_FILE_BYTES = 700 * 1024 * 1024;
/** Unpacked content above this is refused (protects against "zip bombs"). */
export const MAX_UNPACKED_BYTES = 900 * 1024 * 1024;

export type PackageKind = 'project' | 'backup';

export interface AssetMeta extends Omit<Asset, 'data'> {
  /** Path inside the ZIP. */
  path: string;
  sha256: string;
}

export interface Manifest {
  format: typeof FORMAT;
  formatVersion: number;
  kind: PackageKind;
  /** Local database version that produced the file. */
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  /** Project title, or a label for a backup. */
  title: string;
  counts: Record<string, number>;
  dataSha256: string;
  includesResults: boolean;
}

export interface PackageData {
  projects: Project[];
  lessons: Lesson[];
  lessonDocs: LessonDoc[];
  assets: AssetMeta[];
  quizzes: Quiz[];
  attempts: Attempt[];
  progress: LessonProgress[];
  designs: Design[];
  library: LibraryItem[];
  settings: SettingRow[];
}

/** A parsed, validated package: records plus the bytes of each asset. */
export interface Package {
  manifest: Manifest;
  data: PackageData;
  files: Map<string, Uint8Array>;
  warnings: string[];
}

export type TransferErrorCode = 'too-large' | 'not-zip' | 'not-ours' | 'newer' | 'corrupt' | 'invalid' | 'empty';

/** Any problem with a file being imported, with a message a teacher can act on. */
export class TransferError extends Error {
  constructor(
    public code: TransferErrorCode,
    message: string,
  ) {
    super(message);
  }
}
