import { assertCanAuthor, assertCanEdit } from '../auth/access';
import { builtinItems, cleanLibraryTags, isBuiltin, itemAssetIds, LIMITS, normalizeBlocks, normalizeLibraryItem } from '../library/model';
import { LIBRARY_OWNER, type LibraryItem } from '../library/types';
import { newBlock, normalizeDoc } from '../lesson/model';
import type { Asset, AudioBlock, Block, ImageBlock, LessonDoc, VideoBlock } from '../lesson/types';
import { normalizeDesign } from '../studio/model';
import type { Design } from '../studio/types';
import type { EduDB, Lesson } from './db';
import { newId } from './ids';
import type { NewAsset } from './lessonDocs';
import { ValidationError } from './projects';

export interface ItemMeta {
  title: string;
  description?: string;
  tags?: string[] | string;
}

function meta(m: ItemMeta) {
  if (!m.title.trim()) throw new ValidationError({ title: 'العنوان مطلوب.' });
  return { title: m.title.trim().slice(0, LIMITS.title), description: (m.description ?? '').trim().slice(0, LIMITS.description), tags: cleanLibraryTags(m.tags ?? []) };
}

/** Copies assets to a new owner (a lesson or the library); returns old id → new id. */
async function copyAssets(database: EduDB, ids: string[], owner: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  const found = await database.assets.bulkGet(unique);
  const now = Date.now();
  for (const a of found) {
    if (!a) continue;
    const id = newId();
    map.set(a.id, id);
    await database.assets.add({ ...a, id, lessonId: owner, createdAt: now });
  }
  return map;
}

/** Fresh ids for copied blocks, media pointing at the copies, links to objectives dropped (they belong to another lesson). */
function rebaseBlocks(blocks: Block[], assetMap: Map<string, string>, keepObjectives = false): Block[] {
  return blocks.map((b) => {
    const out = { ...structuredClone(b), id: newId(), objectiveIds: keepObjectives ? b.objectiveIds : [] } as Block;
    if ('assetId' in out && out.assetId) (out as ImageBlock).assetId = assetMap.get(out.assetId) ?? null;
    if (out.type === 'cards') out.cards = out.cards.map((c) => ({ ...c, id: newId() }));
    if (out.type === 'summary') out.points = out.points.map((p) => ({ ...p, id: newId() }));
    return out;
  });
}

const assetIdsOf = (blocks: Block[]) => blocks.flatMap((b) => ('assetId' in b && b.assetId ? [b.assetId] : []));

const TABLES = (d: EduDB) => [d.library, d.assets, d.lessons, d.lessonDocs, d.projects, d.designs];

/* ───────── saving to the library ───────── */

export async function saveLessonToLibrary(database: EduDB, lessonId: string, m: ItemMeta): Promise<LibraryItem> {
  assertCanAuthor(); // 1.6.0: the library is for teachers and the admin
  const clean = meta(m);
  return database.transaction('rw', TABLES(database), async () => {
    const lesson = await database.lessons.get(lessonId);
    if (!lesson) throw new Error('الدرس غير موجود.');
    const doc = normalizeDoc(await database.lessonDocs.get(lessonId), lessonId);
    const map = await copyAssets(database, assetIdsOf(doc.blocks), LIBRARY_OWNER);
    const now = Date.now();
    const item: LibraryItem = {
      id: newId(),
      kind: 'lesson',
      ...clean,
      createdAt: now,
      updatedAt: now,
      // Objectives and their links are kept: a template carries the lesson's whole design.
      data: { summary: lesson.summary, duration: lesson.duration, doc: { ...doc, lessonId: 'template', rev: 0, blocks: rebaseBlocks(doc.blocks, map, true) } },
    };
    await database.library.add(item);
    return item;
  });
}

export async function saveBlocksToLibrary(database: EduDB, lessonId: string, blockIds: string[], m: ItemMeta): Promise<LibraryItem> {
  assertCanAuthor(); // 1.6.0: the library is for teachers and the admin
  const clean = meta(m);
  return database.transaction('rw', TABLES(database), async () => {
    const doc = normalizeDoc(await database.lessonDocs.get(lessonId), lessonId);
    const blocks = doc.blocks.filter((b) => blockIds.includes(b.id));
    if (!blocks.length) throw new Error('العنصر غير موجود في الدرس؛ احفظ الدرس أولًا.');
    const map = await copyAssets(database, assetIdsOf(blocks), LIBRARY_OWNER);
    const now = Date.now();
    const item: LibraryItem = { id: newId(), kind: 'block', ...clean, createdAt: now, updatedAt: now, data: { blocks: rebaseBlocks(blocks, map) } };
    await database.library.add(item);
    return item;
  });
}

export async function saveDesignToLibrary(database: EduDB, designId: string, m: ItemMeta): Promise<LibraryItem> {
  assertCanAuthor(); // 1.6.0: the library is for teachers and the admin
  const clean = meta(m);
  const d = normalizeDesign(await database.designs.get(designId));
  if (!d) throw new Error('التصميم غير موجود.');
  const now = Date.now();
  const item: LibraryItem = { id: newId(), kind: 'design', ...clean, createdAt: now, updatedAt: now, data: { kind: d.kind, theme: d.theme, data: structuredClone(d.data) } };
  await database.library.add(item);
  return item;
}

export async function addMediaToLibrary(database: EduDB, file: NewAsset, m: ItemMeta): Promise<LibraryItem> {
  assertCanAuthor(); // 1.6.0: the library is for teachers and the admin
  const clean = meta(m);
  return database.transaction('rw', [database.library, database.assets], async () => {
    const now = Date.now();
    const assetId = newId();
    await database.assets.add({ id: assetId, lessonId: LIBRARY_OWNER, kind: file.kind, mime: file.mime, name: file.name.slice(0, 200), size: file.data.byteLength, width: file.width, height: file.height, data: file.data, createdAt: now });
    const item: LibraryItem = { id: newId(), kind: 'media', ...clean, createdAt: now, updatedAt: now, data: { assetId } };
    await database.library.add(item);
    return item;
  });
}

/** Lesson media can be kept in the library too: the file is copied, the lesson is untouched. */
export async function copyLessonMediaToLibrary(database: EduDB, assetId: string, m: ItemMeta): Promise<LibraryItem> {
  assertCanAuthor(); // 1.6.0: the library is for teachers and the admin
  const clean = meta(m);
  return database.transaction('rw', [database.library, database.assets], async () => {
    const map = await copyAssets(database, [assetId], LIBRARY_OWNER);
    const copy = map.get(assetId);
    if (!copy) throw new Error('الملف غير موجود.');
    const now = Date.now();
    const item: LibraryItem = { id: newId(), kind: 'media', ...clean, createdAt: now, updatedAt: now, data: { assetId: copy } };
    await database.library.add(item);
    return item;
  });
}

export async function updateLibraryItem(database: EduDB, id: string, m: ItemMeta): Promise<void> {
  assertCanAuthor(); // 1.6.0: the library is for teachers and the admin
  if (isBuiltin(id)) throw new Error('القوالب المضمّنة لا تُعدَّل؛ استخدمها ثم احفظ نسختك.');
  const clean = meta(m);
  await database.library.update(id, { ...clean, updatedAt: Date.now() });
}

export interface LibrarySnapshot {
  item: LibraryItem;
  assets: Asset[];
}

export async function deleteLibraryItem(database: EduDB, id: string): Promise<LibrarySnapshot> {
  assertCanAuthor(); // 1.6.0: the library is for teachers and the admin
  if (isBuiltin(id)) throw new Error('القوالب المضمّنة لا تُحذف.');
  return database.transaction('rw', [database.library, database.assets], async () => {
    const item = normalizeLibraryItem(await database.library.get(id));
    if (!item) throw new Error('العنصر غير موجود.');
    const ids = itemAssetIds(item);
    const assets = (await database.assets.bulkGet(ids)).filter((a): a is Asset => !!a && a.lessonId === LIBRARY_OWNER);
    await database.assets.bulkDelete(assets.map((a) => a.id));
    await database.library.delete(id);
    return { item, assets };
  });
}

export async function restoreLibraryItem(database: EduDB, snap: LibrarySnapshot): Promise<void> {
  assertCanAuthor(); // 1.6.0: the library is for teachers and the admin
  await database.transaction('rw', [database.library, database.assets], async () => {
    if (snap.assets.length) await database.assets.bulkPut(snap.assets);
    await database.library.put(snap.item);
  });
}

/* ───────── using library items ───────── */

export function findItem(all: LibraryItem[], id: string): LibraryItem | undefined {
  return all.find((x) => x.id === id) ?? builtinItems().find((x) => x.id === id);
}

async function appendBlocks(database: EduDB, lessonId: string, blocks: Block[]): Promise<LessonDoc> {
  const lesson = await database.lessons.get(lessonId);
  if (!lesson) throw new Error('الدرس غير موجود.');
  const doc = normalizeDoc(await database.lessonDocs.get(lessonId), lessonId);
  const now = Date.now();
  const next = normalizeDoc({ ...doc, blocks: [...doc.blocks, ...blocks], rev: doc.rev + 1, updatedAt: now }, lessonId);
  await database.lessonDocs.put(next);
  await database.lessons.update(lessonId, { updatedAt: Math.max(now, lesson.updatedAt + 1) });
  const p = await database.projects.get(lesson.projectId);
  if (p) await database.projects.update(p.id, { updatedAt: Math.max(now, p.updatedAt + 1) });
  return next;
}

/** A new lesson in a project, built from a lesson template (its media copied into the lesson). */
export async function createLessonFromTemplate(database: EduDB, item: LibraryItem, projectId: string, title: string): Promise<Lesson> {
  assertCanEdit(await database.projects.get(projectId)); // 1.6.0
  if (item.kind !== 'lesson') throw new Error('هذا العنصر ليس قالب درس.');
  if (!title.trim()) throw new ValidationError({ title: 'عنوان الدرس مطلوب.' });
  return database.transaction('rw', TABLES(database), async () => {
    const project = await database.projects.get(projectId);
    if (!project) throw new Error('المشروع غير موجود.');
    const existing = await database.lessons.where('projectId').equals(projectId).toArray();
    const now = Date.now();
    const lesson: Lesson = {
      id: newId(),
      projectId,
      title: title.trim().slice(0, 160),
      summary: item.data.summary,
      duration: item.data.duration,
      status: 'draft',
      tags: [],
      order: existing.reduce((m, l) => Math.max(m, l.order), 0) + 1,
      createdAt: now,
      updatedAt: now,
    };
    await database.lessons.add(lesson);
    const src = item.data.doc;
    const map = await copyAssets(database, assetIdsOf(src.blocks), lesson.id);
    // Objectives get new ids; block links follow them.
    const objMap = new Map(src.objectives.map((o) => [o.id, newId()]));
    const blocks = rebaseBlocks(src.blocks, map, true).map((b) => ({ ...b, objectiveIds: b.objectiveIds.map((o) => objMap.get(o)).filter((x): x is string => !!x) }));
    const doc = normalizeDoc({ ...structuredClone(src), lessonId: lesson.id, rev: 1, updatedAt: now, objectives: src.objectives.map((o) => ({ ...o, id: objMap.get(o.id)! })), blocks }, lesson.id);
    await database.lessonDocs.put(doc);
    await database.projects.update(projectId, { updatedAt: Math.max(now, project.updatedAt + 1) });
    return lesson;
  });
}

/** Adds a library item's content to the end of a lesson: blocks, or a media block for a file. */
export async function insertItemIntoLesson(database: EduDB, item: LibraryItem, lessonId: string): Promise<number> {
  return database.transaction('rw', TABLES(database), async () => {
    let blocks: Block[];
    if (item.kind === 'block') {
      const map = await copyAssets(database, assetIdsOf(item.data.blocks), lessonId);
      blocks = rebaseBlocks(normalizeBlocks(item.data.blocks), map);
    } else if (item.kind === 'media') {
      blocks = [await mediaBlock(database, item.data.assetId, lessonId, item.title)];
    } else throw new Error('يُضاف إلى الدرس عنصر تعليمي أو ملف وسائط.');
    await appendBlocks(database, lessonId, blocks);
    return blocks.length;
  });
}

/** Any stored file (from the library or another lesson) reused in a lesson: copied, then shown in a new block. */
export async function insertAssetIntoLesson(database: EduDB, assetId: string, lessonId: string, title = ''): Promise<void> {
  const lesson = await database.lessons.get(lessonId);
  assertCanEdit(lesson ? await database.projects.get(lesson.projectId) : null); // 1.6.0
  await database.transaction('rw', TABLES(database), async () => {
    await appendBlocks(database, lessonId, [await mediaBlock(database, assetId, lessonId, title)]);
  });
}

async function mediaBlock(database: EduDB, assetId: string, lessonId: string, title: string): Promise<Block> {
  const a = await database.assets.get(assetId);
  if (!a) throw new Error('الملف غير موجود على هذا الجهاز.');
  const map = await copyAssets(database, [assetId], lessonId);
  const id = map.get(assetId)!;
  if (a.kind === 'image') return { ...(newBlock('image') as ImageBlock), assetId: id, alt: title || a.name.replace(/\.[^.]+$/, ''), caption: '' };
  if (a.kind === 'audio') return { ...(newBlock('audio') as AudioBlock), assetId: id, title };
  return { ...(newBlock('video') as VideoBlock), assetId: id, title };
}

export async function createDesignFromTemplate(database: EduDB, item: LibraryItem, projectId: string, lessonId: string | null, title: string): Promise<Design> {
  assertCanEdit(await database.projects.get(projectId)); // 1.6.0
  if (item.kind !== 'design') throw new Error('هذا العنصر ليس قالب تصميم.');
  if (!title.trim()) throw new ValidationError({ title: 'عنوان التصميم مطلوب.' });
  return database.transaction('rw', [database.projects, database.lessons, database.designs], async () => {
    if (!(await database.projects.get(projectId))) throw new Error('المشروع غير موجود.');
    if (lessonId) {
      const l = await database.lessons.get(lessonId);
      if (!l || l.projectId !== projectId) throw new Error('الدرس المختار لا ينتمي إلى هذا المشروع.');
    }
    const now = Date.now();
    const d = normalizeDesign({ id: newId(), projectId, lessonId, kind: item.data.kind, theme: item.data.theme, title, data: structuredClone(item.data.data), rev: 0, createdAt: now, updatedAt: now })!;
    // fresh ids inside the design
    if (d.kind === 'cards') d.data.cards = d.data.cards.map((c) => ({ ...c, id: newId() }));
    if (d.kind === 'summary') d.data.points = d.data.points.map((p) => ({ ...p, id: newId() }));
    if (d.kind === 'conceptmap') {
      const m = new Map(d.data.nodes.map((n) => [n.id, newId()]));
      d.data = { nodes: d.data.nodes.map((n) => ({ ...n, id: m.get(n.id)! })), edges: d.data.edges.map((e) => ({ ...e, id: newId(), from: m.get(e.from)!, to: m.get(e.to)! })) };
    }
    await database.designs.add(d);
    return d;
  });
}
