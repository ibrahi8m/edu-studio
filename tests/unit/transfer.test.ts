import Dexie from 'dexie';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { EduDB } from '../../src/db/db';
import { createDesign, saveDesign } from '../../src/db/designs';
import { addAsset, saveLessonEditor } from '../../src/db/lessonDocs';
import { addMediaToLibrary, createLessonFromTemplate, deleteLibraryItem, insertItemIntoLesson, restoreLibraryItem, saveBlocksToLibrary, saveLessonToLibrary } from '../../src/db/library';
import { visitSection } from '../../src/db/progress';
import { createLesson, createProject, deleteProject } from '../../src/db/projects';
import { createQuiz, saveQuiz, startAttempt, submitAttempt } from '../../src/db/quizzes';
import { saveSetting } from '../../src/db/settings';
import { emptyDoc, newBlock, newObjective } from '../../src/lesson/model';
import type { ActivityBlock, ImageBlock } from '../../src/lesson/types';
import { builtinItems } from '../../src/library/model';
import { LIBRARY_OWNER } from '../../src/library/types';
import { newQuestion } from '../../src/quiz/model';
import type { TrueFalseQuestion } from '../../src/quiz/types';
import { applyImport, planImport } from '../../src/transfer/apply';
import { MAX_FILE_BYTES, TransferError } from '../../src/transfer/format';
import { buildPackage, collectBackup, collectProject, sha256 } from '../../src/transfer/pack';
import { readPackage } from '../../src/transfer/read';

const fresh = () => new EduDB(`tr-${Math.random()}`);
const bytes = (n: number, seed = 1) => {
  const b = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    b[i] = x & 0xff;
  }
  return b.buffer;
};

/** A realistic project: 2 lessons with objectives, an image and an audio file, a quiz with a submitted attempt, progress, a design. */
async function seed(d: EduDB, title = 'وحدة الطاقة') {
  const p = await createProject(d, { title, subject: 'العلوم', tags: ['طاقة'] });
  const l1 = await createLesson(d, p.id, { title: 'مصادر الطاقة', duration: 45 });
  const l2 = await createLesson(d, p.id, { title: 'ترشيد الاستهلاك' });
  const img = await addAsset(d, l1.id, { kind: 'image', mime: 'image/webp', name: 'شمس.webp', data: bytes(5000, 7), width: 1600, height: 900 });
  const snd = await addAsset(d, l1.id, { kind: 'audio', mime: 'audio/mpeg', name: 'شرح.mp3', data: bytes(20000, 9) });
  const doc = emptyDoc(l1.id);
  const o1 = newObjective({ verb: 'يعدّد', content: 'مصادر الطاقة', level: 1 });
  doc.objectives = [o1];
  const ib = newBlock('image') as ImageBlock;
  ib.assetId = img.id;
  ib.alt = 'شمس';
  ib.objectiveIds = [o1.id];
  const ab = newBlock('audio');
  (ab as { assetId: string }).assetId = snd.id;
  doc.blocks = [ib, ab];
  await saveLessonEditor(d, l1.id, doc, { title: l1.title, summary: '', duration: 45, status: 'draft' }, 0);
  const z = await createQuiz(d, p.id, l1.id, 'اختبار الطاقة');
  const q = newQuestion('truefalse') as TrueFalseQuestion;
  q.prompt = 'الشمس نجم.';
  q.answer = true;
  q.feedbackIncorrect = 'راجع.';
  q.objectiveIds = [o1.id];
  await saveQuiz(d, { ...z, questions: [q] }, 0);
  const at = await startAttempt(d, z.id, 'سارة');
  await submitAttempt(d, at.id, { answers: { [q.id]: { type: 'truefalse', value: true } } });
  await visitSection(d, 'سارة', l1, 'intro', 3);
  const des = await createDesign(d, { projectId: p.id, lessonId: l1.id, kind: 'cards', title: 'بطاقات' });
  await saveDesign(d, { ...des, theme: 'forest' }, 0);
  return { p, l1, l2, img, snd, z, o1 };
}

/** Everything of one project, as stored (for exact comparisons). */
async function snapshot(d: EduDB, projectId: string) {
  const lessons = await d.lessons.where('projectId').equals(projectId).sortBy('order');
  const ids = lessons.map((l) => l.id);
  const assets = await d.assets.where('lessonId').anyOf(ids).toArray();
  const quizzes = await d.quizzes.where('projectId').equals(projectId).toArray();
  return {
    project: await d.projects.get(projectId),
    lessons,
    docs: await d.lessonDocs.bulkGet(ids),
    assets: (await Promise.all(assets.map(async (a) => ({ ...a, data: undefined, hash: await sha256(a.data) })))).sort((a, b) => a.id.localeCompare(b.id)),
    quizzes,
    attempts: await d.attempts.where('quizId').anyOf(quizzes.map((q) => q.id)).toArray(),
    progress: await d.progress.where('projectId').equals(projectId).toArray(),
    designs: await d.designs.where('projectId').equals(projectId).toArray(),
  };
}

async function exportProject(d: EduDB, id: string, includeResults = true) {
  return (await buildPackage(await collectProject(d, id, { includeResults }), 'project', { title: 't', appVersion: '0.7.0', includesResults: includeResults })).bytes;
}

describe('ACCEPTANCE (plan, phase 6): export, delete, import — data and media identical by hash', () => {
  it('a project file restores the project exactly: every record, every link, every media file (SHA-256)', async () => {
    const d = fresh();
    const s = await seed(d);
    const before = await snapshot(d, s.p.id);
    const file = await exportProject(d, s.p.id);
    await deleteProject(d, s.p.id);
    expect(await d.projects.count()).toBe(0);
    expect(await d.assets.count()).toBe(0);

    const pkg = await readPackage(file);
    expect(pkg.manifest).toMatchObject({ format: 'ibrahi8m-edu', formatVersion: 1, kind: 'project', schemaVersion: 8, includesResults: true });
    expect(pkg.manifest.counts).toMatchObject({ projects: 1, lessons: 2, quizzes: 1, attempts: 1, progress: 1, designs: 1, assets: 2, assetBytes: 25000 });
    const plan = await planImport(d, pkg);
    expect(plan.projects[0]).toMatchObject({ state: 'none', choice: 'add', titleClash: false });
    await applyImport(d, pkg, plan);
    const after = await snapshot(d, s.p.id);
    expect(after).toEqual(before);
    expect(after.assets.map((a) => a.hash)).toEqual(before.assets.map((a) => a.hash));
  });
});

describe('importing never loses or duplicates data unintentionally', () => {
  it('importing a project that is already here skips it by default; importing twice adds nothing', async () => {
    const d = fresh();
    const s = await seed(d);
    const file = await exportProject(d, s.p.id);
    const pkg = await readPackage(file);
    const plan = await planImport(d, pkg);
    expect(plan.projects[0]).toMatchObject({ state: 'same', choice: 'skip', allowed: ['skip', 'replace', 'copy'], current: { lessons: 2, quizzes: 1, designs: 1, attempts: 1 } });
    await applyImport(d, pkg, plan);
    await applyImport(d, pkg, await planImport(d, pkg));
    expect(await d.projects.count()).toBe(1);
    expect(await d.lessons.count()).toBe(2);
    expect(await d.assets.count()).toBe(2);
    expect(await d.attempts.count()).toBe(1);
  });

  it('replace puts back the exported version and removes later changes, only for that project', async () => {
    const d = fresh();
    const s = await seed(d);
    const other = await seed(d, 'مشروع آخر');
    const before = await snapshot(d, s.p.id);
    const otherBefore = await snapshot(d, other.p.id);
    const file = await exportProject(d, s.p.id);
    // later changes on the device
    await createLesson(d, s.p.id, { title: 'درس أُضيف بعد التصدير' });
    await d.projects.update(s.p.id, { title: 'عنوان معدّل' });
    const pkg = await readPackage(file);
    const plan = await planImport(d, pkg);
    plan.projects[0].choice = 'replace';
    const r = await applyImport(d, pkg, plan);
    expect(r).toMatchObject({ replaced: 1, lessons: 2 });
    expect(await snapshot(d, s.p.id)).toEqual(before);
    expect(await snapshot(d, other.p.id)).toEqual(otherBefore);
  });

  it('a copy gets new identifiers everywhere and keeps every link working; the original is untouched', async () => {
    const d = fresh();
    const s = await seed(d);
    const before = await snapshot(d, s.p.id);
    const pkg = await readPackage(await exportProject(d, s.p.id));
    const plan = await planImport(d, pkg);
    plan.projects[0].choice = 'copy';
    const r = await applyImport(d, pkg, plan);
    const copyId = r.projectIds[0];
    expect(copyId).not.toBe(s.p.id);
    const c = await snapshot(d, copyId);
    expect(c.project?.title).toBe('وحدة الطاقة (نسخة مستوردة)');
    expect(c.lessons).toHaveLength(2);
    const allIds = new Set([...before.lessons.map((l) => l.id), ...before.assets.map((a) => a.id), ...before.quizzes.map((q) => q.id), ...before.attempts.map((a) => a.id), ...before.designs.map((x) => x.id)]);
    for (const x of [...c.lessons, ...c.assets, ...c.quizzes, ...c.attempts, ...c.designs]) expect(allIds.has(x.id)).toBe(false);
    // links inside the copy
    const doc = c.docs.find((x) => x?.lessonId === c.lessons[0].id)!;
    const img = doc.blocks[0] as ImageBlock;
    expect(c.assets.some((a) => a.id === img.assetId)).toBe(true);
    expect(img.objectiveIds).toEqual([doc.objectives[0].id]);
    expect(doc.objectives[0].id).not.toBe(s.o1.id);
    expect(c.quizzes[0]).toMatchObject({ projectId: copyId, lessonId: c.lessons[0].id });
    expect(c.quizzes[0].questions[0].objectiveIds).toEqual([doc.objectives[0].id]);
    expect(c.attempts[0]).toMatchObject({ quizId: c.quizzes[0].id, quiz: { id: c.quizzes[0].id, projectId: copyId } });
    expect(c.progress[0]).toMatchObject({ lessonId: c.lessons[0].id, projectId: copyId, id: `${c.progress[0].studentKey}|${c.lessons[0].id}` });
    expect(c.designs[0]).toMatchObject({ projectId: copyId, lessonId: c.lessons[0].id });
    // same media bytes
    expect(c.assets.map((a) => a.hash).sort()).toEqual(before.assets.map((a) => a.hash).sort());
    expect(await snapshot(d, s.p.id)).toEqual(before);
  });

  it('a project file without results leaves out attempts and progress', async () => {
    const d = fresh();
    const s = await seed(d);
    const pkg = await readPackage(await exportProject(d, s.p.id, false));
    expect(pkg.data.attempts).toHaveLength(0);
    expect(pkg.data.progress).toHaveLength(0);
    expect(pkg.manifest.includesResults).toBe(false);
  });

  it('nothing is written when the import fails half-way (one transaction)', async () => {
    const d = fresh();
    const s = await seed(d);
    const pkg = await readPackage(await exportProject(d, s.p.id));
    await deleteProject(d, s.p.id);
    const plan = await planImport(d, pkg);
    pkg.files.delete(pkg.data.assets[1].id); // a file goes missing after checking
    await expect(applyImport(d, pkg, plan)).rejects.toThrow();
    expect(await d.projects.count()).toBe(0);
    expect(await d.lessons.count()).toBe(0);
    expect(await d.assets.count()).toBe(0);
  });
});

describe('full backup', () => {
  it('restores everything — projects, results, designs, library, settings — into an empty device, identical', async () => {
    const d = fresh();
    const s = await seed(d);
    await seed(d, 'مشروع ثانٍ');
    await saveSetting(d, 'theme', 'light');
    await saveSetting(d, 'ownerName', 'إبراهيم');
    const lib = await addMediaToLibrary(d, { kind: 'image', mime: 'image/png', name: 'شعار.png', data: bytes(3000, 3) }, { title: 'شعار المدرسة', tags: ['صور'] });
    const tpl = await saveLessonToLibrary(d, s.l1.id, { title: 'قالب مصادر الطاقة' });
    const all = async (x: EduDB) => {
      const assets = await x.assets.toArray();
      return {
        projects: await x.projects.orderBy('id').toArray(),
        lessons: await x.lessons.orderBy('id').toArray(),
        docs: await x.lessonDocs.orderBy('lessonId').toArray(),
        assets: (await Promise.all(assets.map(async (a) => ({ ...a, data: undefined, hash: await sha256(a.data) })))).sort((a, b) => a.id.localeCompare(b.id)),
        quizzes: await x.quizzes.orderBy('id').toArray(),
        attempts: await x.attempts.orderBy('id').toArray(),
        progress: await x.progress.orderBy('id').toArray(),
        designs: await x.designs.orderBy('id').toArray(),
        library: await x.library.orderBy('id').toArray(),
        settings: (await x.settings.toArray()).map((r) => [r.key, r.value]).sort(),
      };
    };
    const before = await all(d);
    expect(before.library.map((i) => i.id).sort()).toEqual([lib.id, tpl.id].sort());
    const { bytes: file, manifest } = await buildPackage(await collectBackup(d), 'backup', { title: 'نسخة احتياطية', appVersion: '0.7.0', includesResults: true });
    expect(manifest.counts).toMatchObject({ projects: 2, lessons: 4, attempts: 2, library: 2 });

    const empty = fresh();
    const pkg = await readPackage(file);
    const plan = await planImport(empty, pkg);
    plan.mode = 'replace-all';
    await applyImport(empty, pkg, plan);
    expect(await all(empty)).toEqual(before);
  });

  it('merging a backup into a device adds what is missing, keeps what is there, and does not touch settings unless asked', async () => {
    const d = fresh();
    const s = await seed(d);
    await saveSetting(d, 'theme', 'light');
    const file = (await buildPackage(await collectBackup(d), 'backup', { title: 'b', appVersion: '0.7.0', includesResults: true })).bytes;
    const other = fresh();
    await seed(other, 'مشروع على الجهاز الآخر');
    await saveSetting(other, 'theme', 'dark');
    const pkg = await readPackage(file);
    const plan = await planImport(other, pkg);
    expect(plan.mode).toBe('merge');
    expect(plan.projects[0].choice).toBe('add');
    await applyImport(other, pkg, plan);
    expect(await other.projects.count()).toBe(2);
    expect((await other.settings.get('theme'))?.value).toBe('dark');
    expect(await snapshot(other, s.p.id)).toEqual(await snapshot(d, s.p.id));
  });
});

describe('invalid, damaged, old and large files', () => {
  const zip = (files: Record<string, Uint8Array>) => zipSync(files);

  it('refuses with clear messages: not a zip, a zip from elsewhere, a newer version, damaged data, a missing or altered media file, broken links', async () => {
    const d = fresh();
    const s = await seed(d);
    const good = await exportProject(d, s.p.id);
    const code = async (b: Uint8Array) => {
      try {
        await readPackage(b);
        return 'ok';
      } catch (e) {
        expect(e).toBeInstanceOf(TransferError);
        return `${(e as TransferError).code}: ${(e as Error).message}`;
      }
    };
    expect(await code(strToU8('مجرد نص'))).toMatch(/^not-zip: هذا ليس ملف مشروع/);
    expect(await code(zip({ 'readme.txt': strToU8('x') }))).toMatch(/^not-ours/);
    const parts = unzipSync(good);
    const manifest = JSON.parse(strFromU8(parts['manifest.json']));
    expect(await code(zip({ ...parts, 'manifest.json': strToU8(JSON.stringify({ ...manifest, schemaVersion: 99, appVersion: '9.0.0' })) }))).toMatch(/^newer: .*9\.0\.0/);
    expect(await code(zip({ ...parts, 'manifest.json': strToU8(JSON.stringify({ ...manifest, format: 'other-app' })) }))).toMatch(/^not-ours/);
    expect(await code(zip({ ...parts, 'data.json': strToU8('{"projects":[]}') }))).toMatch(/^corrupt: الملف تالف: البيانات لا تطابق بصمتها/);
    const assetPath = Object.keys(parts).find((k) => k.startsWith('assets/'))!;
    const altered = parts[assetPath].slice();
    altered[10] ^= 0xff;
    expect(await code(zip({ ...parts, [assetPath]: altered }))).toMatch(/^corrupt: الملف تالف: ملف الوسائط «.+» لا يطابق بصمته/);
    const noAsset = { ...parts };
    delete noAsset[assetPath];
    expect(await code(zip(noAsset))).toMatch(/^corrupt: الملف ناقص/);
    expect(await code(good.slice(0, good.length - 200))).toMatch(/^corrupt|^not-ours/);
    // broken links inside data (with a valid checksum, as if made by a faulty tool)
    const data = JSON.parse(strFromU8(parts['data.json']));
    data.lessons[0].projectId = 'nowhere';
    const json = strToU8(JSON.stringify(data));
    expect(await code(zip({ ...parts, 'data.json': json, 'manifest.json': strToU8(JSON.stringify({ ...manifest, dataSha256: await sha256(json) })) }))).toMatch(/^invalid: الدرس «.+» ينتمي إلى مشروع غير موجود/);
    data.lessons[0].projectId = s.p.id;
    data.lessons[0].title = '';
    const json2 = strToU8(JSON.stringify(data));
    expect(await code(zip({ ...parts, 'data.json': json2, 'manifest.json': strToU8(JSON.stringify({ ...manifest, dataSha256: await sha256(json2) })) }))).toMatch(/^invalid: بيانات غير صالحة في الملف \(الدرس رقم 1: title\)/);
    expect(await code(good)).toBe('ok');
  });

  it('refuses files over the size limit before reading them', async () => {
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big[0] = 0x50;
    big[1] = 0x4b;
    await expect(readPackage(big)).rejects.toMatchObject({ code: 'too-large' });
  });

  it('reads an older file (database v4: no designs, progress or library tables) and says it was converted', async () => {
    const d = fresh();
    const s = await seed(d);
    const parts = unzipSync(await exportProject(d, s.p.id));
    const data = JSON.parse(strFromU8(parts['data.json']));
    delete data.designs;
    delete data.progress;
    delete data.library;
    delete data.settings;
    const json = strToU8(JSON.stringify(data));
    const manifest = { ...JSON.parse(strFromU8(parts['manifest.json'])), schemaVersion: 4, appVersion: '0.4.0', dataSha256: await sha256(json) };
    const pkg = await readPackage(zipSync({ ...parts, 'manifest.json': strToU8(JSON.stringify(manifest)), 'data.json': json }));
    expect(pkg.data.designs).toEqual([]);
    expect(pkg.warnings.join(' ')).toContain('من إصدار أقدم (0.4.0)');
    await deleteProject(d, s.p.id);
    await applyImport(d, pkg, await planImport(d, pkg));
    expect(await d.lessons.count()).toBe(2);
  });

  it('carries large media intact (a 40 MB file)', async () => {
    const d = fresh();
    const p = await createProject(d, { title: 'كبير' });
    const l = await createLesson(d, p.id, { title: 'فيديو' });
    const big = bytes(40 * 1024 * 1024, 5);
    const a = await addAsset(d, l.id, { kind: 'video', mime: 'video/mp4', name: 'شرح.mp4', data: big });
    const hash = await sha256(big);
    const file = await exportProject(d, p.id);
    await deleteProject(d, p.id);
    const pkg = await readPackage(file);
    await applyImport(d, pkg, await planImport(d, pkg));
    expect(await sha256((await d.assets.get(a.id))!.data)).toBe(hash);
  }, 60_000);
});

describe('library', () => {
  it('saves a lesson as a template (with its media), creates a new lesson from it with new ids, and media copies are separate', async () => {
    const d = fresh();
    const s = await seed(d);
    const tpl = await saveLessonToLibrary(d, s.l1.id, { title: 'قالب', tags: 'علوم، طاقة' });
    expect(tpl.tags).toEqual(['علوم', 'طاقة']);
    expect(await d.assets.where('lessonId').equals(LIBRARY_OWNER).count()).toBe(2);
    const lesson = await createLessonFromTemplate(d, tpl, s.p.id, 'درس جديد من القالب');
    const doc = (await d.lessonDocs.get(lesson.id))!;
    expect(doc.objectives).toHaveLength(1);
    expect(doc.objectives[0].id).not.toBe(s.o1.id);
    expect(doc.blocks[0].objectiveIds).toEqual([doc.objectives[0].id]);
    const img = doc.blocks[0] as ImageBlock;
    const copied = (await d.assets.get(img.assetId!))!;
    expect(copied.lessonId).toBe(lesson.id);
    expect(await sha256(copied.data)).toBe(await sha256((await d.assets.get(s.img.id))!.data));
    // deleting the source project keeps the template and the new lesson's media
    await deleteProject(d, s.p.id);
    expect(await d.library.count()).toBe(1);
    expect(await d.assets.where('lessonId').equals(LIBRARY_OWNER).count()).toBe(2);
  });

  it('saves blocks and inserts them into another lesson; built-in items insert too; delete with undo', async () => {
    const d = fresh();
    const s = await seed(d);
    const item = await saveBlocksToLibrary(d, s.l1.id, [(await d.lessonDocs.get(s.l1.id))!.blocks[0].id], { title: 'صورة الشمس' });
    expect(await insertItemIntoLesson(d, item, s.l2.id)).toBe(1);
    const tps = builtinItems().find((x) => x.id === 'builtin:block-tps')!;
    await insertItemIntoLesson(d, tps, s.l2.id);
    const doc = (await d.lessonDocs.get(s.l2.id))!;
    expect(doc.blocks.map((b) => b.type)).toEqual(['image', 'activity']);
    expect((doc.blocks[1] as ActivityBlock).title).toBe('فكّر — زاوج — شارك');
    expect(doc.rev).toBe(2);
    const snap = await deleteLibraryItem(d, item.id);
    expect(await d.library.count()).toBe(0);
    expect(await d.assets.where('lessonId').equals(LIBRARY_OWNER).count()).toBe(0);
    await restoreLibraryItem(d, snap);
    expect(await d.assets.where('lessonId').equals(LIBRARY_OWNER).count()).toBe(1);
    await expect(deleteLibraryItem(d, 'builtin:block-tps')).rejects.toThrow('لا تُحذف');
  });
});

describe('migration from phase 5', () => {
  it('a v6 database opens as v7 with everything intact and an empty library', async () => {
    const name = `mig6-${Math.random()}`;
    const v6 = new Dexie(name);
    v6.version(1).stores({ settings: 'key', meta: 'key' });
    v6.version(2).stores({ projects: 'id, updatedAt, createdAt, title, subject, grade, status, *tags', lessons: 'id, projectId, [projectId+order], updatedAt, status, *tags' });
    v6.version(3).stores({ lessonDocs: 'lessonId, updatedAt', assets: 'id, lessonId, kind, createdAt' });
    v6.version(4).stores({ quizzes: 'id, projectId, lessonId, updatedAt', attempts: 'id, quizId, [quizId+studentKey], status, submittedAt' });
    v6.version(5).stores({ progress: 'id, studentKey, lessonId, projectId, updatedAt' });
    v6.version(6).stores({ designs: 'id, projectId, lessonId, kind, updatedAt' });
    await v6.open();
    await v6.table('projects').put({ id: 'p1', title: 'قديم', subject: '', grade: '', description: '', status: 'draft', tags: [], color: 'blue', createdAt: 1, updatedAt: 1 });
    await v6.table('designs').put({ id: 'd1', projectId: 'p1', lessonId: null, kind: 'cards', title: 'ب', theme: 'brand', rev: 1, createdAt: 1, updatedAt: 1, data: { cards: [], show: 'both', columns: 2 } });
    v6.close();
    const v7 = new EduDB(name);
    await v7.open();
    expect(v7.verno).toBe(8);
    expect((await v7.designs.get('d1'))?.title).toBe('ب');
    expect(await v7.library.count()).toBe(0);
  });
});

/* ───────── 1.1.0 data: content kinds, file assets, learners, submissions, prompts, identities ───────── */

describe('1.1.0 data travels in project files and backups', () => {
  it('backup → empty device: kinds, units, file assets, learners, submissions (with attachments), prompts and identities are identical', async () => {
    const { saveLearner, saveSubmission, gradeSubmission, newSubmissionFile } = await import('../../src/learner/db');
    const { savePrompt, saveBrand } = await import('../../src/aistudio/store');
    const { buildPrompt } = await import('../../src/aistudio/engine');
    const { EMPTY_INPUT, BUILTIN_BRANDS } = await import('../../src/aistudio/catalog');
    const d = fresh();
    const p = await createProject(d, { title: 'مساق', kind: 'university', published: false, details: { degree: 'ماجستير', references: 'مرجع' } });
    const l = await createLesson(d, p.id, { title: 'محاضرة', unit: 'الموضوع الأول' });
    const pdf = await addAsset(d, l.id, { kind: 'file', mime: 'application/pdf', name: 'ورقة.pdf', data: bytes(4000, 5) });
    await saveLearner(d, { name: 'سارة', type: 'university', specialization: 'تكنولوجيا' });
    const sub = await saveSubmission(d, 'سارة', l, { id: 'blk', title: 'تكليف' }, { answer: 'إجابتي', files: [newSubmissionFile('حل.pdf', 'application/pdf', bytes(3000, 11))], submit: true });
    await gradeSubmission(d, sub.id, 88, 'جيد');
    const input = { ...EMPTY_INPUT, idea: 'olive' };
    const pr = await savePrompt(d, { title: 'زيتون', mode: 'pro', brandId: null, input, output: buildPrompt(input, 'pro', null) });
    await saveBrand(d, { ...BUILTIN_BRANDS[1], colors: 'violet' });

    const { bytes: file, manifest } = await buildPackage(await collectBackup(d), 'backup', { title: 'b', appVersion: '1.1.0', includesResults: true });
    expect(manifest.counts).toMatchObject({ learners: 1, submissions: 1, prompts: 1, brands: 1, assets: 1 });
    const zip = unzipSync(file);
    expect(Object.keys(zip).some((k) => k.startsWith('submissions/'))).toBe(true);

    const empty = fresh();
    const pkg = await readPackage(file);
    const r = await applyImport(empty, pkg, { ...(await planImport(empty, pkg)), mode: 'replace-all' });
    expect(r).toMatchObject({ submissions: 1, learners: 1, prompts: 1, brands: 1 });
    const p2 = (await empty.projects.get(p.id))!;
    expect(p2).toMatchObject({ kind: 'university', published: false, details: { degree: 'ماجستير', references: 'مرجع' } });
    expect((await empty.lessons.get(l.id))!.unit).toBe('الموضوع الأول');
    const a2 = (await empty.assets.get(pdf.id))!;
    expect(a2.kind).toBe('file');
    expect(await sha256(a2.data)).toBe(await sha256(pdf.data));
    const s2 = (await empty.submissions.get(sub.id))!;
    expect(s2).toMatchObject({ status: 'graded', score: 88, feedback: 'جيد', answer: 'إجابتي' });
    expect(await sha256(s2.files[0].data)).toBe(await sha256(sub.files[0].data));
    expect((await empty.prompts.get(pr.id))!.title).toBe('زيتون');
    expect((await empty.brands.get('brand-ai-universe'))!.colors).toBe('violet');
    expect((await empty.learners.toArray())[0].type).toBe('university');
  });

  it('project file with results carries its submissions; a copy re-links them; a damaged attachment is refused', async () => {
    const { saveSubmission, newSubmissionFile } = await import('../../src/learner/db');
    const d = fresh();
    const p = await createProject(d, { title: 'برنامج', kind: 'training' });
    const l = await createLesson(d, p.id, { title: 'جلسة' });
    await saveSubmission(d, 'منى', l, { id: 'blk', title: 't' }, { answer: 'x', files: [newSubmissionFile('a.txt', 'text/plain', bytes(100, 2))], submit: true });
    const noResults = await buildPackage(await collectProject(d, p.id, { includeResults: false }), 'project', { title: 'x', appVersion: '1.1.0', includesResults: false });
    expect(noResults.manifest.counts.submissions).toBe(0);
    const { bytes: file } = await buildPackage(await collectProject(d, p.id, { includeResults: true }), 'project', { title: 'x', appVersion: '1.1.0', includesResults: true });
    const pkg = await readPackage(file);
    const plan = await planImport(d, pkg);
    plan.projects[0].choice = 'copy';
    const r = await applyImport(d, pkg, plan);
    const copyId = r.projectIds[0];
    expect(copyId).not.toBe(p.id);
    const copies = await d.submissions.where('projectId').equals(copyId).toArray();
    expect(copies).toHaveLength(1);
    const copyLesson = (await d.lessons.where('projectId').equals(copyId).first())!;
    expect(copies[0].lessonId).toBe(copyLesson.id);
    expect(copies[0].id).toBe(`${copies[0].studentKey}|${copyLesson.id}|blk`);

    // Change one byte of the attachment: the whole file is refused before anything is written.
    const entries = unzipSync(file);
    const key = Object.keys(entries).find((k) => k.startsWith('submissions/'))!;
    entries[key] = entries[key].slice();
    entries[key][0] ^= 0xff;
    await expect(readPackage(zipSync(entries))).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('files from 1.0.0 (no new tables or fields) still import', async () => {
    const d = fresh();
    await seed(d);
    const { bytes: file } = await buildPackage(await collectBackup(d), 'backup', { title: 'b', appVersion: '1.0.0', includesResults: true });
    const entries = unzipSync(file);
    const data = JSON.parse(strFromU8(entries['data.json']));
    for (const k of ['learners', 'submissions', 'prompts', 'brands']) delete data[k];
    const json = strToU8(JSON.stringify(data));
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    manifest.schemaVersion = 7;
    manifest.dataSha256 = await sha256(json);
    entries['data.json'] = json;
    entries['manifest.json'] = strToU8(JSON.stringify(manifest));
    const pkg = await readPackage(zipSync(entries));
    expect(pkg.data.submissions).toEqual([]);
    expect(pkg.warnings.join(' ')).toContain('إصدار أقدم');
    const empty = fresh();
    const r = await applyImport(empty, pkg, await planImport(empty, pkg));
    expect(r.added).toBe(1);
  });
});
