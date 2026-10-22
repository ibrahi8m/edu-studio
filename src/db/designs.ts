import { assertCanEdit } from '../auth/access';
import { newId } from './ids';
import { newBlock, normalizeDoc } from '../lesson/model';
import type { ImageBlock } from '../lesson/types';
import { newDesign, normalizeDesign } from '../studio/model';
import type { Design, DesignKind } from '../studio/types';
import type { EduDB } from './db';
import { ValidationError } from './projects';

export class DesignConflictError extends Error {
  constructor(public currentRev: number) {
    super('عُدّل هذا التصميم في نافذة أخرى بعد فتحه هنا.');
  }
}

async function checkLinks(database: EduDB, projectId: string, lessonId: string | null) {
  const project = await database.projects.get(projectId);
  if (!project) throw new Error('المشروع غير موجود.');
  assertCanEdit(project); // 1.5.0
  if (lessonId) {
    const l = await database.lessons.get(lessonId);
    if (!l || l.projectId !== projectId) throw new Error('الدرس المختار لا ينتمي إلى هذا المشروع.');
  }
}

export async function createDesign(database: EduDB, input: { projectId: string; lessonId: string | null; kind: DesignKind; title: string; data?: Design['data'] }): Promise<Design> {
  if (!input.title.trim()) throw new ValidationError({ title: 'عنوان التصميم مطلوب.' });
  return database.transaction('rw', [database.projects, database.lessons, database.designs], async () => {
    await checkLinks(database, input.projectId, input.lessonId);
    const d = normalizeDesign(newDesign(input.projectId, input.lessonId, input.kind, input.title, input.data))!;
    await database.designs.add(d);
    return d;
  });
}

export async function loadDesign(database: EduDB, id: string): Promise<Design | null> {
  return normalizeDesign(await database.designs.get(id));
}

export async function saveDesign(database: EduDB, design: Design, baseRev: number, opts: { force?: boolean } = {}): Promise<{ rev: number; savedAt: number }> {
  if (!design.title.trim()) throw new ValidationError({ title: 'عنوان التصميم مطلوب.' });
  return database.transaction('rw', [database.projects, database.lessons, database.designs], async () => {
    const stored = await database.designs.get(design.id);
    if (!stored) throw new Error('التصميم غير موجود؛ ربما حُذف.');
    if (!opts.force && stored.rev !== baseRev) throw new DesignConflictError(stored.rev);
    await checkLinks(database, design.projectId, design.lessonId);
    const now = Date.now();
    const rev = stored.rev + 1;
    const clean = normalizeDesign({ ...design, rev, updatedAt: Math.max(now, stored.updatedAt + 1), createdAt: stored.createdAt })!;
    await database.designs.put(clean);
    return { rev, savedAt: now };
  });
}

export async function deleteDesign(database: EduDB, id: string): Promise<Design> {
  return database.transaction('rw', database.designs, async () => {
    const d = await database.designs.get(id);
    if (!d) throw new Error('التصميم غير موجود.');
    await database.designs.delete(id);
    return d;
  });
}

export async function restoreDesign(database: EduDB, d: Design): Promise<void> {
  await database.transaction('rw', [database.projects, database.designs], async () => {
    if (!(await database.projects.get(d.projectId))) throw new Error('المشروع الأصلي لم يعد موجودًا.');
    await database.designs.put(d);
  });
}

export async function duplicateDesign(database: EduDB, id: string): Promise<Design> {
  return database.transaction('rw', database.designs, async () => {
    const src = normalizeDesign(await database.designs.get(id));
    if (!src) throw new Error('التصميم غير موجود.');
    const now = Date.now();
    const copy = structuredClone(src) as Design;
    copy.id = newId();
    copy.title = `${src.title} (نسخة)`.slice(0, 120);
    copy.rev = 0;
    copy.createdAt = now;
    copy.updatedAt = now;
    await database.designs.add(copy);
    return copy;
  });
}

/**
 * Puts an exported picture of a design at the end of a lesson as an image block,
 * stored inside the app like any lesson image. Bumps the lesson's revision, so a lesson
 * editor left open in another window will notice and not overwrite it.
 */
export async function addPictureToLesson(
  database: EduDB,
  lessonId: string,
  picture: { data: ArrayBuffer; width: number; height: number; name: string; alt: string; caption: string },
): Promise<{ blockId: string; assetId: string }> {
  return database.transaction('rw', [database.projects, database.lessons, database.lessonDocs, database.assets], async () => {
    const lesson = await database.lessons.get(lessonId);
    if (!lesson) throw new Error('الدرس غير موجود.');
    const doc = normalizeDoc(await database.lessonDocs.get(lessonId), lessonId);
    const assetId = newId();
    const now = Date.now();
    await database.assets.add({
      id: assetId,
      lessonId,
      kind: 'image',
      mime: 'image/png',
      name: picture.name.slice(0, 200),
      size: picture.data.byteLength,
      width: picture.width,
      height: picture.height,
      data: picture.data,
      createdAt: now,
    });
    const block = newBlock('image') as ImageBlock;
    block.assetId = assetId;
    block.alt = picture.alt.slice(0, 300);
    block.caption = picture.caption.slice(0, 300);
    const next = normalizeDoc({ ...doc, blocks: [...doc.blocks, block], rev: doc.rev + 1, updatedAt: now }, lessonId);
    await database.lessonDocs.put(next);
    await database.lessons.update(lessonId, { updatedAt: Math.max(now, lesson.updatedAt + 1) });
    const project = await database.projects.get(lesson.projectId);
    if (project) await database.projects.update(project.id, { updatedAt: Math.max(now, project.updatedAt + 1) });
    return { blockId: block.id, assetId };
  });
}
