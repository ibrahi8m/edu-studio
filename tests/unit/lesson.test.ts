import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { EduDB } from '../../src/db/db';
import { addAsset, ConflictError, deleteUnusedAssets, getAsset, loadLessonDoc, saveLessonEditor, type LessonMeta } from '../../src/db/lessonDocs';
import { createLesson, createProject, deleteLesson, deleteProject, listLessons, restoreLesson, restoreProject, ValidationError } from '../../src/db/projects';
import { checkObjective, detectLevel, isNonMeasurable, objectiveStatement, BLOOM } from '../../src/lesson/bloom';
import {
  addObjective,
  alignment,
  duplicateBlock,
  emptyDoc,
  insertBlock,
  insertBlockAt,
  moveBlock,
  newBlock,
  newObjective,
  normalizeDoc,
  removeBlock,
  removeObjective,
  restoreObjective,
  toggleLink,
  updateBlock,
  activitySteps,
} from '../../src/lesson/model';
import type { LessonDoc } from '../../src/lesson/types';

const fresh = () => new EduDB(`l-${Math.random()}`);
const meta = (title = 'درس'): LessonMeta => ({ title, summary: '', duration: 45, status: 'draft' });

async function seed(d: EduDB) {
  const p = await createProject(d, { title: 'مشروع' });
  const l = await createLesson(d, p.id, { title: 'درس' });
  return { p, l };
}

describe('Bloom bank and objective checks', () => {
  it('has six levels with ten distinct verbs each, and no verb in two levels', () => {
    expect(BLOOM.map((b) => b.level)).toEqual([1, 2, 3, 4, 5, 6]);
    const all = BLOOM.flatMap((b) => b.verbs);
    expect(all).toHaveLength(60);
    expect(new Set(all).size).toBe(60);
  });

  it('detects the level of a bank verb regardless of diacritics and hamza', () => {
    expect(detectLevel('يعدد')).toBe(1);
    expect(detectLevel('يُصمّم')).toBe(6);
    expect(detectLevel('يحلل')).toBe(4);
    expect(detectLevel('يكتب قصيدة')).toBe(0);
  });

  it('flags internal-state verbs as not measurable', () => {
    expect(isNonMeasurable('يفهم')).toBe(true);
    expect(isNonMeasurable('يُدرك')).toBe(true);
    expect(isNonMeasurable('يعدّد')).toBe(false);
  });

  it('builds the ABCD statement and grades completeness', () => {
    const o = newObjective({ level: 1, verb: 'يعدّد', content: 'ثلاثة مصادر للطاقة المتجددة', condition: 'بعد مشاهدة الفيديو', criterion: 'دون أخطاء' });
    expect(objectiveStatement(o)).toBe('أن يعدّد الطالب ثلاثة مصادر للطاقة المتجددة بعد مشاهدة الفيديو دون أخطاء.');
    expect(objectiveStatement(o, 'المتعلم')).toContain('يعدّد المتعلم');
    expect(checkObjective(o).level).toBe('ok');
    expect(checkObjective({ ...o, verb: 'يفهم' }).level).toBe('error');
    expect(checkObjective({ ...o, content: '' }).level).toBe('error');
    expect(checkObjective({ ...o, criterion: '' }).level).toBe('warn');
    const mismatch = checkObjective({ ...o, level: 5 });
    expect(mismatch.messages.some((m) => m.text.includes('التذكر'))).toBe(true);
  });
});

describe('content blocks', () => {
  const three = () => {
    let d = emptyDoc('L');
    const a = newBlock('heading');
    const b = newBlock('text');
    const c = newBlock('image');
    d = insertBlock(insertBlock(insertBlock(d, a), b), c);
    return { d, a, b, c };
  };

  it('creates every block type with sensible defaults', () => {
    for (const t of ['heading', 'text', 'image', 'audio', 'video', 'cards', 'summary', 'activity'] as const) {
      const b = newBlock(t);
      expect(b.type).toBe(t);
      expect(b.objectiveIds).toEqual([]);
    }
  });

  it('inserts at the end, after a given block and at an index', () => {
    const { d, a, b, c } = three();
    expect(d.blocks.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
    const n = newBlock('activity');
    expect(insertBlock(d, n, a.id).blocks.map((x) => x.id)).toEqual([a.id, n.id, b.id, c.id]);
    expect(insertBlockAt(d, n, 0).blocks[0].id).toBe(n.id);
  });

  it('moves blocks and stops at the ends', () => {
    const { d, a, b, c } = three();
    expect(moveBlock(d, c.id, -1).blocks.map((x) => x.id)).toEqual([a.id, c.id, b.id]);
    expect(moveBlock(d, a.id, -1)).toBe(d);
    expect(moveBlock(d, c.id, 1)).toBe(d);
  });

  it('updates without changing id or type, removes with index for undo, and duplicates', () => {
    const { d, b } = three();
    const u = updateBlock(d, b.id, { text: 'مرحبًا', type: 'image' } as never);
    expect(u.blocks[1]).toMatchObject({ id: b.id, type: 'text', text: 'مرحبًا' });
    const r = removeBlock(u, b.id);
    expect(r.index).toBe(1);
    expect(r.doc.blocks).toHaveLength(2);
    expect(insertBlockAt(r.doc, r.removed!, r.index).blocks[1].id).toBe(b.id);
    const dup = duplicateBlock(u, b.id);
    expect(dup.blocks).toHaveLength(4);
    expect(dup.blocks[2]).toMatchObject({ type: 'text', text: 'مرحبًا' });
    expect(dup.blocks[2].id).not.toBe(b.id);
  });

  it('parses activity steps from numbered or bulleted lines', () => {
    const a = { ...newBlock('activity'), steps: '1. اقرأ النص\n- ناقش زميلك\n\n٣) اكتب' } as ReturnType<typeof newBlock> & { type: 'activity' };
    expect(activitySteps(a as never)).toEqual(['اقرأ النص', 'ناقش زميلك', '٣) اكتب']);
  });
});

describe('objectives and alignment', () => {
  it('reports uncovered, partial and covered objectives and unlinked blocks', () => {
    let d = emptyDoc('L');
    const o1 = newObjective({ verb: 'يعدّد', content: 'أ' });
    const o2 = newObjective({ verb: 'يشرح', content: 'ب' });
    const o3 = newObjective({ verb: 'يصمّم', content: 'ج' });
    d = addObjective(addObjective(addObjective(d, o1), o2), o3);
    const text = newBlock('text');
    const act = newBlock('activity');
    const heading = newBlock('heading');
    const loose = newBlock('video');
    d = insertBlock(insertBlock(insertBlock(insertBlock(d, heading), text), act), loose);
    d = toggleLink(d, text.id, o1.id);
    d = toggleLink(d, act.id, o1.id);
    d = toggleLink(d, text.id, o2.id);
    const r = alignment(d);
    expect(r.rows.map((x) => x.status)).toEqual(['covered', 'partial', 'uncovered']);
    expect(r.uncovered).toBe(1);
    expect(r.partial).toBe(1);
    expect(r.unlinkedBlockIds).toEqual([loose.id]); // headings are not counted
    expect(alignment(toggleLink(d, text.id, o2.id)).rows[1].status).toBe('uncovered');
  });

  it('removing an objective drops its links, and undo restores them', () => {
    let d = emptyDoc('L');
    const o = newObjective({ verb: 'يعدّد', content: 'أ' });
    d = addObjective(d, o);
    const b = newBlock('text');
    d = toggleLink(insertBlock(d, b), b.id, o.id);
    const { doc, removed } = removeObjective(d, o.id);
    expect(doc.objectives).toHaveLength(0);
    expect(doc.blocks[0].objectiveIds).toEqual([]);
    const back = restoreObjective(doc, removed!);
    expect(back.objectives[0].id).toBe(o.id);
    expect(back.blocks[0].objectiveIds).toEqual([o.id]);
  });
});

describe('defensive loading', () => {
  it('repairs a damaged document instead of crashing', () => {
    const o = newObjective({ verb: 'يعدّد' });
    const raw = {
      rev: -3,
      audience: 42,
      objectives: [o, null, 'x', { level: 99, verb: 5 }],
      blocks: [
        { type: 'text', text: 'سليم', objectiveIds: [o.id, 'missing-objective'] },
        { type: 'unknown-type' },
        null,
        { type: 'activity', duration: -5, grouping: 'aliens' },
        { type: 'cards', cards: [{ front: 'س', back: 'ج' }, 7] },
      ],
    };
    const d = normalizeDoc(raw, 'L');
    expect(d.rev).toBe(0);
    expect(d.audience).toBe('الطالب');
    expect(d.objectives).toHaveLength(2);
    expect(d.objectives[1].level).toBe(0);
    expect(d.blocks.map((b) => b.type)).toEqual(['text', 'activity', 'cards']);
    expect(d.blocks[0].objectiveIds).toEqual([o.id]);
    expect(d.blocks[1]).toMatchObject({ duration: 0, grouping: 'individual' });
    expect(normalizeDoc(null, 'L').blocks).toEqual([]);
  });
});

describe('saving the lesson editor', () => {
  it('saves content and lesson card together, and reloads them after reopening the database', async () => {
    const name = `save-${Math.random()}`;
    const a = new EduDB(name);
    const { l } = await seed(a);
    let doc = await loadLessonDoc(a, l.id);
    expect(doc.rev).toBe(0);
    const o = newObjective({ level: 1, verb: 'يعدّد', content: 'مصادر الطاقة' });
    const t = { ...newBlock('text'), text: 'الطاقة هي القدرة على بذل شغل.' };
    doc = toggleLink(insertBlock(addObjective(doc, o), t), t.id, o.id);
    doc = { ...doc, strategies: ['cooperative'], assessmentTypes: ['formative'], assessmentTools: ['exit'] };
    const res = await saveLessonEditor(a, l.id, doc, { ...meta('الطاقة وأشكالها'), duration: 50 }, 0);
    expect(res.rev).toBe(1);
    a.close();

    const b = new EduDB(name);
    const back = await loadLessonDoc(b, l.id);
    expect(back.rev).toBe(1);
    expect(back.objectives[0]).toMatchObject({ verb: 'يعدّد', content: 'مصادر الطاقة' });
    expect(back.blocks[0]).toMatchObject({ type: 'text', text: 'الطاقة هي القدرة على بذل شغل.', objectiveIds: [o.id] });
    expect(back.strategies).toEqual(['cooperative']);
    expect((await b.lessons.get(l.id))).toMatchObject({ title: 'الطاقة وأشكالها', duration: 50 });
  });

  it('refuses to overwrite a newer save from another window, unless forced', async () => {
    const d = fresh();
    const { l } = await seed(d);
    const doc = await loadLessonDoc(d, l.id);
    await saveLessonEditor(d, l.id, doc, meta(), 0); // window A → rev 1
    await expect(saveLessonEditor(d, l.id, doc, meta('B'), 0)).rejects.toBeInstanceOf(ConflictError); // window B still on rev 0
    const forced = await saveLessonEditor(d, l.id, doc, meta('B'), 0, { force: true });
    expect(forced.rev).toBe(2);
    expect((await d.lessons.get(l.id))?.title).toBe('B');
  });

  it('validates the lesson card and refuses to save a lesson that was deleted', async () => {
    const d = fresh();
    const { l } = await seed(d);
    const doc = await loadLessonDoc(d, l.id);
    await expect(saveLessonEditor(d, l.id, doc, meta('   '), 0)).rejects.toBeInstanceOf(ValidationError);
    await deleteLesson(d, l.id);
    await expect(saveLessonEditor(d, l.id, doc, meta(), 0)).rejects.toThrow('الدرس غير موجود');
  });
});

describe('local media', () => {
  const bytes = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i % 256)).buffer;

  it('stores and returns the exact bytes of a file', async () => {
    const d = fresh();
    const { l } = await seed(d);
    const a = await addAsset(d, l.id, { kind: 'image', mime: 'image/webp', name: 'شكل.webp', data: bytes(5000), width: 40, height: 30 });
    const back = await getAsset(d, a.id);
    expect(back?.size).toBe(5000);
    expect(new Uint8Array(back!.data)[4999]).toBe(4999 % 256);
    expect(back).toMatchObject({ mime: 'image/webp', width: 40, height: 30, lessonId: l.id });
  });

  it('cleans up only unused, older files of that lesson', async () => {
    const d = fresh();
    const { l } = await seed(d);
    const used = await addAsset(d, l.id, { kind: 'image', mime: 'image/png', name: 'a', data: bytes(10) });
    const unused = await addAsset(d, l.id, { kind: 'audio', mime: 'audio/wav', name: 'b', data: bytes(10) });
    const fresh2 = await addAsset(d, l.id, { kind: 'video', mime: 'video/webm', name: 'c', data: bytes(10) });
    await d.assets.update(used.id, { createdAt: 0 });
    await d.assets.update(unused.id, { createdAt: 0 });
    const doc = insertBlock(emptyDoc(l.id), { ...newBlock('image'), assetId: used.id } as never);
    await saveLessonEditor(d, l.id, doc, meta(), 0);
    expect(await deleteUnusedAssets(d, l.id)).toBe(1);
    expect(await getAsset(d, used.id)).toBeTruthy();
    expect(await getAsset(d, unused.id)).toBeUndefined();
    expect(await getAsset(d, fresh2.id)).toBeTruthy(); // within the grace period
  });

  it('deleting a lesson removes its content and media; undo restores all of it', async () => {
    const d = fresh();
    const { l } = await seed(d);
    const a = await addAsset(d, l.id, { kind: 'image', mime: 'image/png', name: 'a', data: bytes(64) });
    const doc = insertBlock(emptyDoc(l.id), { ...newBlock('image'), assetId: a.id } as never);
    await saveLessonEditor(d, l.id, doc, meta(), 0);
    const snap = await deleteLesson(d, l.id);
    expect(await d.lessonDocs.get(l.id)).toBeUndefined();
    expect(await d.assets.count()).toBe(0);
    await restoreLesson(d, snap);
    expect((await loadLessonDoc(d, l.id)).blocks).toHaveLength(1);
    expect(await getAsset(d, a.id)).toBeTruthy();
  });

  it('deleting a project removes all its lessons, content and media; undo restores it', async () => {
    const d = fresh();
    const { p, l } = await seed(d);
    const other = await createProject(d, { title: 'آخر' });
    const ol = await createLesson(d, other.id, { title: 'يبقى' });
    await addAsset(d, l.id, { kind: 'audio', mime: 'audio/wav', name: 'x', data: bytes(8) });
    await addAsset(d, ol.id, { kind: 'audio', mime: 'audio/wav', name: 'y', data: bytes(8) });
    await saveLessonEditor(d, l.id, addObjective(emptyDoc(l.id)), meta(), 0);
    const snap = await deleteProject(d, p.id);
    expect(await d.lessonDocs.count()).toBe(0);
    expect(await d.assets.count()).toBe(1); // the other project's file stays
    await restoreProject(d, snap);
    expect((await listLessons(d, p.id))).toHaveLength(1);
    expect((await loadLessonDoc(d, l.id)).objectives).toHaveLength(1);
    expect(await d.assets.count()).toBe(2);
  });
});

describe('migration from phase 1', () => {
  it('a v2 database (projects + lessons) opens as v3 with every project and lesson intact', async () => {
    const name = `mig2-${Math.random()}`;
    const v2 = new Dexie(name);
    v2.version(1).stores({ settings: 'key', meta: 'key' });
    v2.version(2).stores({
      projects: 'id, updatedAt, createdAt, title, subject, grade, status, *tags',
      lessons: 'id, projectId, [projectId+order], updatedAt, status, *tags',
    });
    await v2.open();
    await v2.table('settings').put({ key: 'theme', value: 'light', updatedAt: 1 });
    await v2.table('projects').put({ id: 'p1', title: 'مشروع قديم', subject: 'العلوم', grade: '', description: '', status: 'draft', tags: [], color: 'blue', createdAt: 1, updatedAt: 1 });
    await v2.table('lessons').put({ id: 'l1', projectId: 'p1', title: 'درس قديم', summary: 'ملخص', duration: 45, status: 'ready', tags: [], order: 1, createdAt: 1, updatedAt: 1 });
    v2.close();

    const v3 = new EduDB(name);
    await v3.open();
    expect(v3.verno).toBe(6); // opens at the current schema version
    expect(await v3.projects.get('p1')).toMatchObject({ title: 'مشروع قديم' });
    expect(await v3.lessons.get('l1')).toMatchObject({ title: 'درس قديم', summary: 'ملخص', duration: 45 });
    const doc: LessonDoc = await loadLessonDoc(v3, 'l1'); // an old lesson opens with an empty plan
    expect(doc.blocks).toEqual([]);
    await saveLessonEditor(v3, 'l1', addObjective(doc), { title: 'درس قديم', summary: 'ملخص', duration: 45, status: 'ready' }, 0);
    expect((await loadLessonDoc(v3, 'l1')).objectives).toHaveLength(1);
  });
});
