import type { EduDB, Lesson, Project } from '../db/db';
import { newId } from '../db/ids';
import { deleteProject } from '../db/projects';
import { normalizeArabic } from '../db/search';
import type { Asset, Block, LessonDoc } from '../lesson/types';
import { itemAssetIds } from '../library/model';
import { LIBRARY_OWNER, type LibraryItem } from '../library/types';
import type { Attempt, Question, Quiz } from '../quiz/types';
import type { LessonProgress } from '../student/types';
import type { Design } from '../studio/types';
import type { AssetMeta, Package } from './format';

/**
 * What to do with each project in the file:
 *   add      not on this device: added with the same identifiers (an exact restore)
 *   skip     already here: left untouched (the default, so importing twice never duplicates)
 *   replace  already here: the copy on this device is removed and the file's version put back
 *   copy     added as a separate copy with new identifiers (and «(نسخة مستوردة)» in the title)
 */
export type Choice = 'add' | 'skip' | 'replace' | 'copy';

export interface ProjectPlan {
  id: string;
  title: string;
  /** none: new to this device · same: the same project is here · clash: some of its records belong to something else here */
  state: 'none' | 'same' | 'clash';
  /** Another project here has the same title (different identity). */
  titleClash: boolean;
  allowed: Choice[];
  choice: Choice;
  counts: { lessons: number; quizzes: number; designs: number; assets: number; bytes: number; attempts: number; progress: number };
  /** For 'same': how much is on the device now (shown before replacing). */
  current?: { lessons: number; quizzes: number; designs: number; attempts: number };
}

export interface ImportPlan {
  kind: Package['manifest']['kind'];
  projects: ProjectPlan[];
  library: { id: string; title: string; exists: boolean }[];
  settings: number;
  /** Backups only: merge into this device, or replace everything on it. */
  mode: 'merge' | 'replace-all';
  restoreSettings: boolean;
}

function bundle(pkg: Package, projectId: string) {
  const d = pkg.data;
  const lessons = d.lessons.filter((l) => l.projectId === projectId);
  const lessonIds = new Set(lessons.map((l) => l.id));
  const quizzes = d.quizzes.filter((q) => q.projectId === projectId);
  const quizIds = new Set(quizzes.map((q) => q.id));
  return {
    project: d.projects.find((p) => p.id === projectId)!,
    lessons,
    docs: d.lessonDocs.filter((x) => lessonIds.has(x.lessonId)),
    assets: d.assets.filter((a) => lessonIds.has(a.lessonId)),
    quizzes,
    attempts: d.attempts.filter((a) => quizIds.has(a.quizId)),
    progress: d.progress.filter((p) => p.projectId === projectId),
    designs: d.designs.filter((x) => x.projectId === projectId),
  };
}
type Bundle = ReturnType<typeof bundle>;

/** Which project on this device a stored record belongs to (null when it does not exist). */
async function ownersHere(database: EduDB, b: Bundle): Promise<Set<string>> {
  const owners = new Set<string>();
  const add = (p: string | undefined | null) => p && owners.add(p);
  for (const l of await database.lessons.bulkGet(b.lessons.map((x) => x.id))) add(l?.projectId);
  const assetLessons = (await database.assets.bulkGet(b.assets.map((x) => x.id))).filter(Boolean).map((a) => a!.lessonId);
  for (const l of await database.lessons.bulkGet(assetLessons)) add(l?.projectId ?? '(أخرى)');
  if (assetLessons.includes(LIBRARY_OWNER)) owners.add('(المكتبة)');
  for (const q of await database.quizzes.bulkGet(b.quizzes.map((x) => x.id))) add(q?.projectId);
  for (const x of await database.designs.bulkGet(b.designs.map((y) => y.id))) add(x?.projectId);
  const attemptQuizzes = (await database.attempts.bulkGet(b.attempts.map((x) => x.id))).filter(Boolean).map((a) => a!.quizId);
  for (const q of await database.quizzes.bulkGet(attemptQuizzes)) add(q?.projectId ?? '(أخرى)');
  return owners;
}

/** Compares the file with this device and proposes safe defaults. Nothing is written. */
export async function planImport(database: EduDB, pkg: Package): Promise<ImportPlan> {
  const here = await database.projects.toArray();
  const projects: ProjectPlan[] = [];
  for (const p of pkg.data.projects) {
    const b = bundle(pkg, p.id);
    const exists = here.find((x) => x.id === p.id);
    const owners = await ownersHere(database, b);
    owners.delete(p.id);
    const state: ProjectPlan['state'] = owners.size ? 'clash' : exists ? 'same' : 'none';
    const titleClash = here.some((x) => x.id !== p.id && normalizeArabic(x.title) === normalizeArabic(p.title));
    const allowed: Choice[] = state === 'none' ? ['add', 'copy'] : state === 'same' ? ['skip', 'replace', 'copy'] : ['skip', 'copy'];
    const counts = {
      lessons: b.lessons.length,
      quizzes: b.quizzes.length,
      designs: b.designs.length,
      assets: b.assets.length,
      bytes: b.assets.reduce((s, a) => s + a.size, 0),
      attempts: b.attempts.length,
      progress: b.progress.length,
    };
    let current: ProjectPlan['current'];
    if (exists) {
      const quizIds = (await database.quizzes.where('projectId').equals(p.id).primaryKeys()) as string[];
      current = {
        lessons: await database.lessons.where('projectId').equals(p.id).count(),
        quizzes: quizIds.length,
        designs: await database.designs.where('projectId').equals(p.id).count(),
        attempts: quizIds.length ? await database.attempts.where('quizId').anyOf(quizIds).count() : 0,
      };
    }
    projects.push({ id: p.id, title: p.title, state, titleClash, allowed, choice: state === 'none' ? 'add' : state === 'same' ? 'skip' : 'copy', counts, current });
  }
  const libHere = new Set((await database.library.bulkGet(pkg.data.library.map((x) => x.id))).filter(Boolean).map((x) => x!.id));
  return {
    kind: pkg.manifest.kind,
    projects,
    library: pkg.data.library.map((x) => ({ id: x.id, title: x.title, exists: libHere.has(x.id) })),
    settings: pkg.data.settings.length,
    mode: 'merge',
    restoreSettings: false,
  };
}

/* ───────── writing ───────── */

const toAsset = (m: AssetMeta, bytes: Uint8Array, patch: Partial<Asset> = {}): Asset => {
  const { path: _p, sha256: _s, ...rest } = m;
  void _p;
  void _s;
  return { ...rest, data: bytes.slice().buffer as ArrayBuffer, ...patch };
};

/** New identifiers for everything in a project, links following them. */
function remap(b: Bundle, titleSuffix: boolean) {
  const id = new Map<string, string>();
  const n = (old: string) => {
    if (!id.has(old)) id.set(old, newId());
    return id.get(old)!;
  };
  const m = (old: string | null | undefined) => (old ? (id.get(old) ?? old) : null);
  const projectId = n(b.project.id);
  b.lessons.forEach((l) => n(l.id));
  b.assets.forEach((a) => n(a.id));
  b.quizzes.forEach((q) => n(q.id));
  b.docs.forEach((d) => d.objectives.forEach((o) => n(o.id)));
  const project: Project = { ...b.project, id: projectId, title: titleSuffix ? `${b.project.title} (نسخة مستوردة)`.slice(0, 160) : b.project.title };
  const lessons: Lesson[] = b.lessons.map((l) => ({ ...l, id: m(l.id)!, projectId }));
  const docs: LessonDoc[] = b.docs.map((d) => ({
    ...d,
    lessonId: m(d.lessonId)!,
    objectives: d.objectives.map((o) => ({ ...o, id: m(o.id)! })),
    blocks: d.blocks.map((blk) => ({ ...blk, objectiveIds: blk.objectiveIds.map((o) => m(o)!), ...('assetId' in blk ? { assetId: m(blk.assetId) } : {}) })) as LessonDoc['blocks'],
  }));
  const qs = (list: Question[]) => list.map((q) => ({ ...q, objectiveIds: q.objectiveIds.map((o) => m(o)!) })) as Question[];
  const quizzes: Quiz[] = b.quizzes.map((q) => ({ ...q, id: m(q.id)!, projectId, lessonId: m(q.lessonId), questions: qs(q.questions) }));
  const attempts: Attempt[] = b.attempts.map((a) => ({
    ...a,
    id: newId(),
    quizId: m(a.quizId)!,
    quiz: { ...a.quiz, id: m(a.quiz.id)!, projectId, lessonId: m(a.quiz.lessonId), questions: qs(a.quiz.questions) },
  }));
  const progress: LessonProgress[] = b.progress.map((p) => ({ ...p, id: `${p.studentKey}|${m(p.lessonId)}`, lessonId: m(p.lessonId)!, projectId }));
  const designs: Design[] = b.designs.map((x) => ({ ...x, id: newId(), projectId, lessonId: m(x.lessonId) }));
  const assets = b.assets.map((a) => ({ meta: a, patch: { id: m(a.id)!, lessonId: m(a.lessonId)! } }));
  return { project, lessons, docs, quizzes, attempts, progress, designs, assets };
}

export interface ImportResult {
  added: number;
  replaced: number;
  copied: number;
  skipped: number;
  lessons: number;
  quizzes: number;
  designs: number;
  assets: number;
  attempts: number;
  progress: number;
  library: number;
  settings: number;
  /** Ids of the projects now on the device from this file. */
  projectIds: string[];
}

const ALL = (d: EduDB) => [d.projects, d.lessons, d.lessonDocs, d.assets, d.quizzes, d.attempts, d.progress, d.designs, d.library, d.settings];

/**
 * Writes the file into the local database in ONE transaction: if anything fails,
 * nothing is changed. Only what the plan says is written.
 */
export async function applyImport(database: EduDB, pkg: Package, plan: ImportPlan): Promise<ImportResult> {
  const r: ImportResult = { added: 0, replaced: 0, copied: 0, skipped: 0, lessons: 0, quizzes: 0, designs: 0, assets: 0, attempts: 0, progress: 0, library: 0, settings: 0, projectIds: [] };
  const file = (id: string) => {
    const b = pkg.files.get(id);
    if (!b) throw new Error('ملف وسائط ناقص في الملف المستورد.');
    return b;
  };
  await database.transaction('rw', ALL(database), async () => {
    if (pkg.manifest.kind === 'backup' && plan.mode === 'replace-all') {
      for (const t of ALL(database)) await t.clear();
      const d = pkg.data;
      await database.projects.bulkAdd(d.projects);
      await database.lessons.bulkAdd(d.lessons);
      await database.lessonDocs.bulkAdd(d.lessonDocs);
      await database.assets.bulkAdd(d.assets.map((a) => toAsset(a, file(a.id))));
      await database.quizzes.bulkAdd(d.quizzes);
      await database.attempts.bulkAdd(d.attempts);
      await database.progress.bulkAdd(d.progress);
      await database.designs.bulkAdd(d.designs);
      await database.library.bulkAdd(d.library);
      await database.settings.bulkPut(d.settings);
      Object.assign(r, {
        added: d.projects.length,
        lessons: d.lessons.length,
        quizzes: d.quizzes.length,
        designs: d.designs.length,
        assets: d.assets.length,
        attempts: d.attempts.length,
        progress: d.progress.length,
        library: d.library.length,
        settings: d.settings.length,
        projectIds: d.projects.map((p) => p.id),
      });
      return;
    }

    for (const pp of plan.projects) {
      if (!pp.allowed.includes(pp.choice)) throw new Error('اختيار غير مسموح لهذا المشروع.');
      const b = bundle(pkg, pp.id);
      if (pp.choice === 'skip') {
        r.skipped++;
        continue;
      }
      if (pp.choice === 'replace') {
        await deleteProject(database, pp.id);
        r.replaced++;
      }
      if (pp.choice === 'add' || pp.choice === 'replace') {
        // Exactly as in the file: same identifiers.
        if (pp.choice === 'add' && (await database.projects.get(pp.id))) throw new Error(`المشروع «${pp.title}» موجود على الجهاز؛ أعد قراءة الملف.`);
        await database.projects.add(b.project);
        await database.lessons.bulkAdd(b.lessons);
        await database.lessonDocs.bulkPut(b.docs);
        await database.assets.bulkAdd(b.assets.map((a) => toAsset(a, file(a.id))));
        await database.quizzes.bulkAdd(b.quizzes);
        await database.attempts.bulkAdd(b.attempts);
        await database.progress.bulkPut(b.progress);
        await database.designs.bulkAdd(b.designs);
        if (pp.choice === 'add') r.added++;
        r.projectIds.push(pp.id);
        Object.assign(r, { lessons: r.lessons + b.lessons.length, quizzes: r.quizzes + b.quizzes.length, designs: r.designs + b.designs.length, assets: r.assets + b.assets.length, attempts: r.attempts + b.attempts.length, progress: r.progress + b.progress.length });
        continue;
      }
      // copy
      const c = remap(b, pp.state !== 'none' || pp.titleClash);
      await database.projects.add(c.project);
      await database.lessons.bulkAdd(c.lessons);
      await database.lessonDocs.bulkPut(c.docs);
      await database.assets.bulkAdd(c.assets.map((a) => toAsset(a.meta, file(a.meta.id), a.patch)));
      await database.quizzes.bulkAdd(c.quizzes);
      await database.attempts.bulkAdd(c.attempts);
      await database.progress.bulkPut(c.progress);
      await database.designs.bulkAdd(c.designs);
      r.copied++;
      r.projectIds.push(c.project.id);
      Object.assign(r, { lessons: r.lessons + c.lessons.length, quizzes: r.quizzes + c.quizzes.length, designs: r.designs + c.designs.length, assets: r.assets + c.assets.length, attempts: r.attempts + c.attempts.length, progress: r.progress + c.progress.length });
    }

    // Library items: new ones are added with their files; ones already here are kept as they are.
    for (const item of pkg.data.library) {
      if (await database.library.get(item.id)) continue;
      const ids = itemAssetIds(item);
      const metas = pkg.data.assets.filter((a) => ids.includes(a.id) && a.lessonId === LIBRARY_OWNER);
      const clash = (await database.assets.bulkGet(metas.map((a) => a.id))).some(Boolean);
      const map = new Map(metas.map((a) => [a.id, clash ? newId() : a.id]));
      await database.assets.bulkAdd(metas.map((a) => toAsset(a, file(a.id), { id: map.get(a.id)! })));
      await database.library.add(clash ? relink(item, map) : item);
      r.library++;
      r.assets += metas.length;
    }
    if (plan.restoreSettings && pkg.data.settings.length) {
      await database.settings.bulkPut(pkg.data.settings);
      r.settings = pkg.data.settings.length;
    }
  });
  return r;
}

function relink(item: LibraryItem, map: Map<string, string>): LibraryItem {
  const fix = (b: Block): Block => ('assetId' in b && b.assetId ? ({ ...b, assetId: map.get(b.assetId) ?? b.assetId } as Block) : b);
  if (item.kind === 'media') return { ...item, data: { assetId: map.get(item.data.assetId) ?? item.data.assetId } };
  if (item.kind === 'block') return { ...item, data: { blocks: item.data.blocks.map(fix) } };
  if (item.kind === 'lesson') return { ...item, data: { ...item.data, doc: { ...item.data.doc, blocks: item.data.doc.blocks.map(fix) } } };
  return item;
}
