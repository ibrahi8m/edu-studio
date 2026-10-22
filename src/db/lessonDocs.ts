import { assertCanEdit } from '../auth/access';
import { emptyDoc, normalizeDoc, referencedAssetIds } from '../lesson/model';
import type { Asset, AssetKind, LessonDoc } from '../lesson/types';
import type { EduDB, ItemStatus, Lesson } from './db';
import { newId } from './ids';
import { validateLesson, ValidationError } from './projects';

/** Another window (or tab) saved this lesson after we loaded it. */
export class ConflictError extends Error {
  constructor(public currentRev: number) {
    super('عُدّل هذا الدرس في نافذة أخرى بعد فتحه هنا.');
  }
}

export async function loadLessonDoc(database: EduDB, lessonId: string): Promise<LessonDoc> {
  const raw = await database.lessonDocs.get(lessonId);
  return raw ? normalizeDoc(raw, lessonId) : emptyDoc(lessonId);
}

export interface LessonMeta {
  title: string;
  summary: string;
  duration: number;
  status: ItemStatus;
}

export interface SaveResult {
  rev: number;
  savedAt: number;
}

/**
 * Saves the lesson card (title, summary…) and its content document in one transaction.
 * `baseRev` is the revision the editor loaded; if storage has moved on, nothing is written.
 */
export async function saveLessonEditor(
  database: EduDB,
  lessonId: string,
  doc: LessonDoc,
  meta: LessonMeta,
  baseRev: number,
  opts: { force?: boolean } = {},
): Promise<SaveResult> {
  const errors = validateLesson(meta);
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return database.transaction('rw', [database.projects, database.lessons, database.lessonDocs], async () => {
    const lesson = await database.lessons.get(lessonId);
    if (!lesson) throw new Error('الدرس غير موجود؛ ربما حُذف.');
    assertCanEdit(await database.projects.get(lesson.projectId));
    const stored = await database.lessonDocs.get(lessonId);
    const storedRev = stored?.rev ?? 0;
    if (!opts.force && storedRev !== baseRev) throw new ConflictError(storedRev);
    const now = Date.now();
    const rev = storedRev + 1;
    const clean = normalizeDoc({ ...doc, rev, updatedAt: now }, lessonId);
    await database.lessonDocs.put(clean);
    const nextLesson: Lesson = {
      ...lesson,
      title: meta.title.trim(),
      summary: meta.summary.trim(),
      duration: meta.duration,
      status: meta.status,
      updatedAt: Math.max(now, lesson.updatedAt + 1),
    };
    await database.lessons.put(nextLesson);
    const project = await database.projects.get(lesson.projectId);
    if (project) await database.projects.update(project.id, { updatedAt: Math.max(now, project.updatedAt + 1) });
    return { rev, savedAt: now };
  });
}

export interface NewAsset {
  kind: AssetKind;
  mime: string;
  name: string;
  data: ArrayBuffer;
  width?: number;
  height?: number;
}

export async function addAsset(database: EduDB, lessonId: string, a: NewAsset): Promise<Asset> {
  const asset: Asset = {
    id: newId(),
    lessonId,
    kind: a.kind,
    mime: a.mime,
    name: a.name.slice(0, 200),
    size: a.data.byteLength,
    width: a.width,
    height: a.height,
    data: a.data,
    createdAt: Date.now(),
  };
  await database.assets.add(asset);
  return asset;
}

export async function getAsset(database: EduDB, id: string): Promise<Asset | undefined> {
  return database.assets.get(id);
}

/**
 * Removes media files of a lesson that no saved block uses any more.
 * Runs when the editor opens, so a pending "undo" can never lose its file.
 * Files added less than `graceMs` ago are kept (they may belong to an unsaved edit).
 */
export async function deleteUnusedAssets(database: EduDB, lessonId: string, graceMs = 60_000): Promise<number> {
  return database.transaction('rw', [database.lessonDocs, database.assets], async () => {
    const doc = await loadLessonDoc(database, lessonId);
    const used = referencedAssetIds(doc);
    const cutoff = Date.now() - graceMs;
    const unused = await database.assets
      .where('lessonId')
      .equals(lessonId)
      .filter((a) => !used.has(a.id) && a.createdAt < cutoff)
      .primaryKeys();
    await database.assets.bulkDelete(unused);
    return unused.length;
  });
}

/** Total stored media size for a lesson (bytes). */
export async function lessonMediaBytes(database: EduDB, lessonId: string): Promise<number> {
  let total = 0;
  await database.assets.where('lessonId').equals(lessonId).each((a) => (total += a.size));
  return total;
}
