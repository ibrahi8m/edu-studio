import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { EduDB } from '../../src/db/db';
import { addPictureToLesson, createDesign, deleteDesign, DesignConflictError, duplicateDesign, loadDesign, restoreDesign, saveDesign } from '../../src/db/designs';
import { loadLessonDoc, saveLessonEditor } from '../../src/db/lessonDocs';
import { createLesson, createProject, deleteLesson, deleteProject, restoreLesson, restoreProject } from '../../src/db/projects';
import { emptyDoc, newBlock, newObjective } from '../../src/lesson/model';
import type { CardsBlock, HeadingBlock, ImageBlock, SummaryBlock } from '../../src/lesson/types';
import { addNode, autoLayout, CANVAS, connect, designIssues, flipEdge, moveNode, newNode, normalizeDesign, removeNode, restoreNode, THEMES } from '../../src/studio/model';
import { prefill, prefillCounts } from '../../src/studio/prefill';
import { edgeGeometry, mapBounds, nodeBox } from '../../src/studio/render';
import { estimate, wrap } from '../../src/studio/text';
import type { ConceptMapData, ConceptMapDesign } from '../../src/studio/types';

const fresh = () => new EduDB(`st-${Math.random()}`);

/* ───────── text ───────── */

describe('wrapping Arabic text for SVG', () => {
  // estimate: each character = 0.52 × font size
  it('breaks at spaces within the width, keeps typed line breaks, cuts over-long words, and ends with … at the line limit', () => {
    expect(wrap('الطاقة المتجددة لا تنفد', 100, 20, 400, { m: estimate })).toEqual(['الطاقة', 'المتجددة', 'لا تنفد']);
    expect(wrap('سطر أول\nسطر ثانٍ', 1000, 20, 400, { m: estimate })).toEqual(['سطر أول', 'سطر ثانٍ']);
    const long = wrap('كلمةطويلةجدًاجدًاجدًا', 60, 20, 400, { m: estimate });
    expect(long.length).toBeGreaterThan(1);
    expect(long.join('')).toBe('كلمةطويلةجدًاجدًاجدًا');
    expect(long.every((l) => estimate(l, 20, 400) <= 60)).toBe(true);
    const cut = wrap('واحد اثنان ثلاثة أربعة خمسة ستة', 60, 20, 400, { m: estimate, maxLines: 2 });
    expect(cut).toHaveLength(2);
    expect(cut[1].endsWith('…')).toBe(true);
    expect(wrap('', 100, 20)).toEqual([]);
  });
});

/* ───────── themes ───────── */

function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bb] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bb;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('colour themes', () => {
  it('every text colour meets WCAG AA (4.5:1) on its background, and white concept text on every concept colour', () => {
    for (const [name, t] of Object.entries(THEMES)) {
      expect(contrast(t.text, t.bg), `${name} text/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.text, t.surface), `${name} text/surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.muted, t.bg), `${name} muted/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.muted, t.surface), `${name} muted/surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.onAccent, t.accent), `${name} onAccent/accent`).toBeGreaterThanOrEqual(4.5);
    }
    for (const c of ['#1D4ED8', '#0F766E', '#15803D', '#B45309', '#6D28D9', '#BE123C']) expect(contrast('#FFFFFF', c), c).toBeGreaterThanOrEqual(4.5);
  });
});

/* ───────── concept map operations ───────── */

function tenNodeMap(): ConceptMapData {
  let m: ConceptMapData = { nodes: [newNode('الطاقة', CANVAS.width / 2, CANVAS.height / 2, 0, 'ellipse')], edges: [] };
  const names = ['متجددة', 'غير متجددة', 'الشمس', 'الرياح', 'المياه', 'الفحم', 'النفط', 'الغاز', 'الكهرباء'];
  for (const n of names) m = addNode(m, n).map;
  const id = (t: string) => m.nodes.find((n) => n.text === t)!.id;
  const links: [string, string, string][] = [
    ['الطاقة', 'متجددة', 'نوعها'],
    ['الطاقة', 'غير متجددة', 'نوعها'],
    ['متجددة', 'الشمس', 'مثل'],
    ['متجددة', 'الرياح', 'مثل'],
    ['متجددة', 'المياه', 'مثل'],
    ['غير متجددة', 'الفحم', 'مثل'],
    ['غير متجددة', 'النفط', 'مثل'],
    ['غير متجددة', 'الغاز', 'مثل'],
    ['الشمس', 'الكهرباء', 'تولّد'],
  ];
  for (const [a, b, l] of links) m = connect(m, id(a), id(b), l).map;
  return m;
}

describe('concept map operations', () => {
  it('adds concepts in free places inside the canvas, never on top of each other', () => {
    const m = tenNodeMap();
    expect(m.nodes).toHaveLength(10);
    for (const n of m.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(60);
      expect(n.x).toBeLessThanOrEqual(CANVAS.width - 60);
      expect(n.y).toBeGreaterThanOrEqual(30);
      expect(n.y).toBeLessThanOrEqual(CANVAS.height - 30);
    }
    for (let i = 0; i < m.nodes.length; i++)
      for (let j = i + 1; j < m.nodes.length; j++) {
        const [a, b] = [m.nodes[i], m.nodes[j]];
        expect(a.x === b.x && a.y === b.y, `${a.text} / ${b.text}`).toBe(false);
      }
  });

  it('refuses an arrow to itself or a duplicate; reversing keeps the words; removing a concept removes its arrows and undo brings them back', () => {
    let m = tenNodeMap();
    const [a, b] = m.nodes;
    expect(connect(m, a.id, a.id).problem).toBe('self');
    expect(connect(m, a.id, m.nodes[1].id).problem).toBe('exists');
    const e = m.edges[0];
    m = flipEdge(m, e.id);
    expect(m.edges[0]).toMatchObject({ from: e.to, to: e.from, label: 'نوعها' });
    const r = removeNode(m, b.id); // «متجددة»: 1 in + 3 out
    expect(r.edges).toHaveLength(4);
    expect(r.map.nodes).toHaveLength(9);
    expect(r.map.edges).toHaveLength(5);
    const back = restoreNode(r.map, r.node!, r.edges, r.index);
    expect(back.nodes.map((n) => n.id)).toEqual(m.nodes.map((n) => n.id));
    expect(back.edges).toHaveLength(9);
  });

  it('keeps moved concepts inside the canvas; tidy layout puts the first concept in the centre', () => {
    let m = tenNodeMap();
    m = moveNode(m, m.nodes[3].id, -500, 99999);
    expect(m.nodes[3]).toMatchObject({ x: 70, y: CANVAS.height - 36 });
    const t = autoLayout(m);
    expect(t.nodes[0]).toMatchObject({ x: CANVAS.width / 2, y: CANVAS.height / 2 });
    expect(new Set(t.nodes.map((n) => `${n.x},${n.y}`)).size).toBe(10);
  });

  it('measures boxes from the text, ends arrows at the box edges, and crops the picture to the content', () => {
    const n = newNode('مفهوم', 300, 200);
    const box = nodeBox(n, estimate);
    expect(box.lines).toEqual(['مفهوم']);
    expect(box.w).toBeGreaterThanOrEqual(110);
    const far = nodeBox(newNode('آخر', 700, 200), estimate);
    const g = edgeGeometry(box, far);
    expect(g.x1).toBeCloseTo(300 + box.w / 2, 0); // leaves the first box on its edge
    expect(g.x2).toBeLessThan(700 - far.w / 2 + 1);
    const b = mapBounds([box, far]);
    expect(b.x).toBeCloseTo(300 - box.w / 2);
    expect(b.w).toBeCloseTo(700 + far.w / 2 - (300 - box.w / 2));
  });

  it('repairs damaged stored designs: drops arrows to missing concepts, duplicates and self-arrows; clamps positions', () => {
    const d = normalizeDesign({
      id: 'd',
      projectId: 'p',
      kind: 'conceptmap',
      theme: 'nope',
      title: 'خ',
      data: {
        nodes: [
          { id: 'a', text: 'أ', x: -50, y: 99999, color: 99, shape: 'x' },
          { id: 'b', text: 'ب', x: 100, y: 100 },
        ],
        edges: [
          { from: 'a', to: 'b', label: 'ل' },
          { from: 'a', to: 'b', label: 'مكرر' },
          { from: 'a', to: 'a' },
          { from: 'a', to: 'zzz' },
        ],
      },
    }) as ConceptMapDesign;
    expect(d.theme).toBe('brand');
    expect(d.data.nodes[0]).toMatchObject({ x: 0, y: CANVAS.height, color: 6, shape: 'rounded' });
    expect(d.data.edges).toHaveLength(1);
    expect(normalizeDesign({ id: 'x', projectId: 'p', kind: 'poster' })).toBeNull();
  });

  it('tells what a design still needs', () => {
    const m: ConceptMapDesign = { id: 'd', projectId: 'p', lessonId: null, kind: 'conceptmap', title: '', theme: 'brand', rev: 0, createdAt: 0, updatedAt: 0, data: { nodes: [newNode('', 1, 1), newNode('ب', 2, 2)], edges: [] } };
    expect(designIssues(m)).toEqual(['اكتب عنوان التصميم.', 'يوجد مفهوم بلا نص.', 'اربط المفاهيم بأسهم.']);
    expect(designIssues({ ...m, title: 'خ', data: tenNodeMap() })).toEqual([]);
  });
});

/* ───────── storage ───────── */

async function setup() {
  const d = fresh();
  const p = await createProject(d, { title: 'وحدة الطاقة' });
  const l = await createLesson(d, p.id, { title: 'مصادر الطاقة' });
  return { d, p, l };
}

describe('design storage', () => {
  it('ACCEPTANCE (plan, phase 5): a 10-concept map is saved and reopens exactly as it was, after closing the database', async () => {
    const { d, p } = await setup();
    const created = await createDesign(d, { projectId: p.id, lessonId: null, kind: 'conceptmap', title: 'خريطة الطاقة' });
    const data = tenNodeMap();
    await saveDesign(d, { ...(created as ConceptMapDesign), data, theme: 'forest' }, 0);
    d.close();
    const again = new EduDB(d.name);
    const back = (await loadDesign(again, created.id)) as ConceptMapDesign;
    expect(back.data).toEqual(data); // every concept (text, position, colour, shape) and every arrow (ends, words)
    expect(back.theme).toBe('forest');
    expect(back.rev).toBe(1);
  });

  it('refuses a stale save from another window; checks the lesson belongs to the project', async () => {
    const { d, p } = await setup();
    const other = await createProject(d, { title: 'آخر' });
    const ol = await createLesson(d, other.id, { title: 'درس آخر' });
    const x = await createDesign(d, { projectId: p.id, lessonId: null, kind: 'cards', title: 'بطاقات' });
    await saveDesign(d, x, 0);
    await expect(saveDesign(d, { ...x, title: 'قديم' }, 0)).rejects.toBeInstanceOf(DesignConflictError);
    await expect(createDesign(d, { projectId: p.id, lessonId: ol.id, kind: 'cards', title: 'خطأ' })).rejects.toThrow('لا ينتمي');
    await expect(createDesign(d, { projectId: p.id, lessonId: null, kind: 'cards', title: '  ' })).rejects.toThrow();
  });

  it('duplicates, deletes with undo; deleting a lesson keeps its designs (unlinked, relinked on undo); deleting the project removes them (undo restores)', async () => {
    const { d, p, l } = await setup();
    const x = await createDesign(d, { projectId: p.id, lessonId: l.id, kind: 'summary', title: 'ملخص' });
    const copy = await duplicateDesign(d, x.id);
    expect(copy).toMatchObject({ title: 'ملخص (نسخة)', lessonId: l.id, rev: 0 });
    expect(copy.id).not.toBe(x.id);
    const removed = await deleteDesign(d, copy.id);
    expect(await d.designs.count()).toBe(1);
    await restoreDesign(d, removed);
    expect(await d.designs.count()).toBe(2);
    const ls = await deleteLesson(d, l.id);
    expect((await d.designs.toArray()).map((z) => z.lessonId)).toEqual([null, null]);
    await restoreLesson(d, ls);
    expect((await d.designs.toArray()).map((z) => z.lessonId)).toEqual([l.id, l.id]);
    const ps = await deleteProject(d, p.id);
    expect(await d.designs.count()).toBe(0);
    await restoreProject(d, ps);
    expect(await d.designs.count()).toBe(2);
  });

  it('adds a picture to the end of a lesson as a stored image with alt text, and bumps the lesson revision', async () => {
    const { d, l } = await setup();
    const doc = emptyDoc(l.id);
    doc.blocks = [newBlock('text')];
    await saveLessonEditor(d, l.id, doc, { title: l.title, summary: '', duration: 0, status: 'draft' }, 0);
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
    const r = await addPictureToLesson(d, l.id, { data: png, width: 2400, height: 1600, name: 'خريطة.png', alt: 'خريطة مفاهيم: الطاقة', caption: 'الطاقة' });
    const after = await loadLessonDoc(d, l.id);
    expect(after.rev).toBe(2);
    const img = after.blocks.at(-1) as ImageBlock;
    expect(img).toMatchObject({ type: 'image', assetId: r.assetId, alt: 'خريطة مفاهيم: الطاقة', caption: 'الطاقة', decorative: false });
    expect(await d.assets.get(r.assetId)).toMatchObject({ lessonId: l.id, mime: 'image/png', width: 2400, size: 8 });
    // an editor that loaded revision 1 must not overwrite the lesson now
    await expect(saveLessonEditor(d, l.id, doc, { title: l.title, summary: '', duration: 0, status: 'draft' }, 1)).rejects.toThrow();
  });
});

/* ───────── start from a lesson ───────── */

describe('starting a design from a lesson', () => {
  it('takes the lesson cards, its summary (or objectives), and its main headings for a map', () => {
    const doc = emptyDoc('l');
    doc.objectives = [newObjective({ verb: 'يعدّد', content: 'مصادر الطاقة', level: 1 })];
    const cards = newBlock('cards') as CardsBlock;
    cards.cards = [
      { id: 'a', front: 'شمس', back: 'متجددة' },
      { id: 'b', front: '', back: '' },
    ];
    const h = newBlock('heading') as HeadingBlock;
    h.text = 'الطاقة المتجددة';
    const src = { title: 'مصادر الطاقة', doc: { ...doc, blocks: [cards, h] } };
    expect(prefillCounts(src)).toEqual({ cards: 1, summary: 1, conceptmap: 1 });
    expect(prefill('cards', src)).toMatchObject({ cards: [{ front: 'شمس', back: 'متجددة' }] });
    expect(prefill('summary', src)).toMatchObject({ heading: 'مصادر الطاقة', style: 'steps', points: [{ title: 'أن يعدّد الطالب مصادر الطاقة.' }] });
    const map = prefill('conceptmap', src) as ConceptMapData;
    expect(map.nodes.map((n) => n.text)).toEqual(['مصادر الطاقة', 'الطاقة المتجددة']);
    expect(map.edges).toMatchObject([{ label: 'يشمل' }]);
    const s = newBlock('summary') as SummaryBlock;
    s.title = 'خلاصة';
    s.points = [{ id: 'p', title: 'نقطة', text: 'شرح' }];
    expect(prefill('summary', { ...src, doc: { ...src.doc, blocks: [s] } })).toMatchObject({ heading: 'خلاصة', points: [{ title: 'نقطة', text: 'شرح' }] });
    expect(prefill('cards', { title: 't', doc: emptyDoc('x') })).toBeNull();
  });
});

/* ───────── upgrade from 0.5.0 ───────── */

describe('migration from phase 4', () => {
  it('a v5 database opens as v6 with everything intact and an empty designs table', async () => {
    const name = `mig5-${Math.random()}`;
    const v5 = new Dexie(name);
    v5.version(1).stores({ settings: 'key', meta: 'key' });
    v5.version(2).stores({ projects: 'id, updatedAt, createdAt, title, subject, grade, status, *tags', lessons: 'id, projectId, [projectId+order], updatedAt, status, *tags' });
    v5.version(3).stores({ lessonDocs: 'lessonId, updatedAt', assets: 'id, lessonId, kind, createdAt' });
    v5.version(4).stores({ quizzes: 'id, projectId, lessonId, updatedAt', attempts: 'id, quizId, [quizId+studentKey], status, submittedAt' });
    v5.version(5).stores({ progress: 'id, studentKey, lessonId, projectId, updatedAt' });
    await v5.open();
    await v5.table('projects').put({ id: 'p1', title: 'قديم', subject: '', grade: '', description: '', status: 'draft', tags: [], color: 'blue', createdAt: 1, updatedAt: 1 });
    await v5.table('progress').put({ id: 'ساره|l1', studentKey: 'ساره', studentName: 'سارة', lessonId: 'l1', projectId: 'p1', visited: ['intro'], sections: 2, current: 'intro', activities: {}, cards: {}, startedAt: 1, updatedAt: 1, completedAt: null });
    v5.close();
    const v6 = new EduDB(name);
    await v6.open();
    expect(v6.verno).toBe(8);
    expect((await v6.projects.get('p1'))?.title).toBe('قديم');
    expect((await v6.progress.get('ساره|l1'))?.visited).toEqual(['intro']);
    expect(await v6.designs.count()).toBe(0);
  });
});
