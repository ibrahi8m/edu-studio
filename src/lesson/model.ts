import { newId } from '../db/ids';
import { BLOCK_META } from './catalog';
import type {
  ActivityBlock,
  Block,
  BlockType,
  BloomLevel,
  CardsBlock,
  FlashCard,
  Grouping,
  LessonDoc,
  Objective,
  SummaryBlock,
  SummaryPoint,
  SummaryStyle,
} from './types';

/* ───────── factories ───────── */

export function emptyDoc(lessonId: string): LessonDoc {
  return {
    lessonId,
    schema: 1,
    rev: 0,
    audience: 'الطالب',
    objectives: [],
    strategies: [],
    strategyNotes: '',
    assessmentTypes: [],
    assessmentTools: [],
    assessmentNotes: '',
    blocks: [],
    updatedAt: 0,
  };
}

export function newObjective(partial: Partial<Objective> = {}): Objective {
  return { id: newId(), level: 0, verb: '', content: '', condition: '', criterion: '', ...partial };
}

export function newCard(): FlashCard {
  return { id: newId(), front: '', back: '' };
}

export function newPoint(): SummaryPoint {
  return { id: newId(), title: '', text: '' };
}

export function newBlock(type: BlockType): Block {
  const base = { id: newId(), objectiveIds: [] as string[] };
  switch (type) {
    case 'heading':
      return { ...base, type, text: '', level: 2 };
    case 'text':
      return { ...base, type, text: '' };
    case 'image':
      return { ...base, type, assetId: null, alt: '', decorative: false, caption: '' };
    case 'audio':
      return { ...base, type, assetId: null, title: '', transcript: '' };
    case 'video':
      return { ...base, type, assetId: null, title: '', transcript: '' };
    case 'cards':
      return { ...base, type, title: '', cards: [newCard(), newCard()] };
    case 'summary':
      return { ...base, type, title: '', style: 'grid', points: [newPoint(), newPoint(), newPoint()] };
    case 'activity':
      return { ...base, type, title: '', grouping: 'individual', duration: 0, steps: '', materials: '', output: '', track: 'core', submit: false };
    case 'file':
      return { ...base, type, assetId: null, title: '', description: '' };
  }
}

/* ───────── defensive loading ───────── */

const str = (v: unknown, max = 5000) => (typeof v === 'string' ? v.slice(0, max) : '');
const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const id = (v: unknown) => (typeof v === 'string' && v ? v : newId());
const LEVELS = [0, 1, 2, 3, 4, 5, 6];
const GROUPINGS: Grouping[] = ['individual', 'pairs', 'groups', 'class'];
const STYLES: SummaryStyle[] = ['grid', 'steps', 'central'];

function normBlock(raw: unknown): Block | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const type = r.type as BlockType;
  if (!(type in BLOCK_META)) return null;
  const b = newBlock(type);
  b.id = id(r.id);
  b.objectiveIds = strArr(r.objectiveIds);
  switch (b.type) {
    case 'heading':
      b.text = str(r.text, 300);
      b.level = r.level === 3 ? 3 : 2;
      break;
    case 'text':
      b.text = str(r.text, 20000);
      break;
    case 'image':
      b.assetId = typeof r.assetId === 'string' ? r.assetId : null;
      b.alt = str(r.alt, 500);
      b.decorative = r.decorative === true;
      b.caption = str(r.caption, 500);
      break;
    case 'audio':
    case 'video':
      b.assetId = typeof r.assetId === 'string' ? r.assetId : null;
      b.title = str(r.title, 300);
      b.transcript = str(r.transcript, 20000);
      break;
    case 'cards':
      b.title = str(r.title, 300);
      b.cards = Array.isArray(r.cards)
        ? r.cards.filter((c) => c && typeof c === 'object').map((c) => ({ id: id(c.id), front: str(c.front, 1000), back: str(c.back, 2000) }))
        : [];
      break;
    case 'summary':
      b.title = str(r.title, 300);
      b.style = STYLES.includes(r.style as SummaryStyle) ? (r.style as SummaryStyle) : 'grid';
      b.points = Array.isArray(r.points)
        ? r.points.filter((p) => p && typeof p === 'object').map((p) => ({ id: id(p.id), title: str(p.title, 200), text: str(p.text, 1000) }))
        : [];
      break;
    case 'activity':
      b.title = str(r.title, 300);
      b.grouping = GROUPINGS.includes(r.grouping as Grouping) ? (r.grouping as Grouping) : 'individual';
      b.duration = Number.isInteger(r.duration) && (r.duration as number) >= 0 && (r.duration as number) <= 600 ? (r.duration as number) : 0;
      b.steps = str(r.steps, 5000);
      b.materials = str(r.materials, 1000);
      b.output = str(r.output, 1000);
      b.track = r.track === 'remedial' || r.track === 'enrichment' ? r.track : 'core';
      b.submit = r.submit === true;
      break;
    case 'file':
      b.assetId = typeof r.assetId === 'string' ? r.assetId : null;
      b.title = str(r.title, 300);
      b.description = str(r.description, 1000);
      break;
  }
  return b;
}

/** Turns whatever is stored (possibly from an older or damaged version) into a valid document. */
export function normalizeDoc(raw: unknown, lessonId: string): LessonDoc {
  const d = emptyDoc(lessonId);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  d.rev = Number.isInteger(r.rev) && (r.rev as number) >= 0 ? (r.rev as number) : 0;
  d.updatedAt = typeof r.updatedAt === 'number' ? r.updatedAt : 0;
  d.audience = str(r.audience, 60) || 'الطالب';
  d.objectives = Array.isArray(r.objectives)
    ? r.objectives
        .filter((o) => o && typeof o === 'object')
        .map((o) => ({
          id: id(o.id),
          level: (LEVELS.includes(o.level) ? o.level : 0) as BloomLevel | 0,
          verb: str(o.verb, 60),
          content: str(o.content, 500),
          condition: str(o.condition, 300),
          criterion: str(o.criterion, 300),
        }))
    : [];
  d.strategies = strArr(r.strategies);
  d.strategyNotes = str(r.strategyNotes, 3000);
  d.assessmentTypes = strArr(r.assessmentTypes);
  d.assessmentTools = strArr(r.assessmentTools);
  d.assessmentNotes = str(r.assessmentNotes, 3000);
  const objectiveIds = new Set(d.objectives.map((o) => o.id));
  d.blocks = (Array.isArray(r.blocks) ? r.blocks : [])
    .map(normBlock)
    .filter((b): b is Block => !!b)
    .map((b) => ({ ...b, objectiveIds: b.objectiveIds.filter((x) => objectiveIds.has(x)) }));
  return d;
}

/* ───────── pure operations (all return a new document) ───────── */

const move = <T>(arr: T[], from: number, to: number): T[] => {
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return arr;
  const out = arr.slice();
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
};

/** Inserts after the block with `afterId`, or at the end. */
export function insertBlock(doc: LessonDoc, block: Block, afterId?: string | null): LessonDoc {
  const i = afterId ? doc.blocks.findIndex((b) => b.id === afterId) : -1;
  const blocks = doc.blocks.slice();
  if (i >= 0) blocks.splice(i + 1, 0, block);
  else blocks.push(block);
  return { ...doc, blocks };
}

export function insertBlockAt(doc: LessonDoc, block: Block, index: number): LessonDoc {
  const blocks = doc.blocks.slice();
  blocks.splice(Math.max(0, Math.min(index, blocks.length)), 0, block);
  return { ...doc, blocks };
}

export function moveBlock(doc: LessonDoc, blockId: string, dir: -1 | 1): LessonDoc {
  const i = doc.blocks.findIndex((b) => b.id === blockId);
  const blocks = move(doc.blocks, i, i + dir);
  return blocks === doc.blocks ? doc : { ...doc, blocks };
}

export function updateBlock<B extends Block>(doc: LessonDoc, blockId: string, patch: Partial<B>): LessonDoc {
  return { ...doc, blocks: doc.blocks.map((b) => (b.id === blockId ? ({ ...b, ...patch, id: b.id, type: b.type } as Block) : b)) };
}

export function removeBlock(doc: LessonDoc, blockId: string): { doc: LessonDoc; removed: Block | null; index: number } {
  const index = doc.blocks.findIndex((b) => b.id === blockId);
  if (index < 0) return { doc, removed: null, index };
  return { doc: { ...doc, blocks: doc.blocks.filter((b) => b.id !== blockId) }, removed: doc.blocks[index], index };
}

/** Copies a block (new ids for the block and its cards/points); media files are shared, not copied. */
export function duplicateBlock(doc: LessonDoc, blockId: string): LessonDoc {
  const b = doc.blocks.find((x) => x.id === blockId);
  if (!b) return doc;
  const copy = structuredClone(b) as Block;
  copy.id = newId();
  if (copy.type === 'cards') copy.cards = copy.cards.map((c) => ({ ...c, id: newId() }));
  if (copy.type === 'summary') copy.points = copy.points.map((p) => ({ ...p, id: newId() }));
  return insertBlock(doc, copy, blockId);
}

export function toggleLink(doc: LessonDoc, blockId: string, objectiveId: string): LessonDoc {
  return {
    ...doc,
    blocks: doc.blocks.map((b) =>
      b.id !== blockId
        ? b
        : {
            ...b,
            objectiveIds: b.objectiveIds.includes(objectiveId) ? b.objectiveIds.filter((x) => x !== objectiveId) : [...b.objectiveIds, objectiveId],
          },
    ),
  };
}

export function addObjective(doc: LessonDoc, o: Objective = newObjective()): LessonDoc {
  return { ...doc, objectives: [...doc.objectives, o] };
}

export function updateObjective(doc: LessonDoc, objectiveId: string, patch: Partial<Objective>): LessonDoc {
  return { ...doc, objectives: doc.objectives.map((o) => (o.id === objectiveId ? { ...o, ...patch, id: o.id } : o)) };
}

export function moveObjective(doc: LessonDoc, objectiveId: string, dir: -1 | 1): LessonDoc {
  const i = doc.objectives.findIndex((o) => o.id === objectiveId);
  const objectives = move(doc.objectives, i, i + dir);
  return objectives === doc.objectives ? doc : { ...doc, objectives };
}

export interface RemovedObjective {
  objective: Objective;
  index: number;
  /** Blocks that were linked to it, so undo can restore the links. */
  linkedBlockIds: string[];
}

/** Removes an objective and every link to it. */
export function removeObjective(doc: LessonDoc, objectiveId: string): { doc: LessonDoc; removed: RemovedObjective | null } {
  const index = doc.objectives.findIndex((o) => o.id === objectiveId);
  if (index < 0) return { doc, removed: null };
  const linkedBlockIds = doc.blocks.filter((b) => b.objectiveIds.includes(objectiveId)).map((b) => b.id);
  return {
    doc: {
      ...doc,
      objectives: doc.objectives.filter((o) => o.id !== objectiveId),
      blocks: doc.blocks.map((b) => (b.objectiveIds.includes(objectiveId) ? { ...b, objectiveIds: b.objectiveIds.filter((x) => x !== objectiveId) } : b)),
    },
    removed: { objective: doc.objectives[index], index, linkedBlockIds },
  };
}

export function restoreObjective(doc: LessonDoc, r: RemovedObjective): LessonDoc {
  const objectives = doc.objectives.slice();
  objectives.splice(Math.min(r.index, objectives.length), 0, r.objective);
  return {
    ...doc,
    objectives,
    blocks: doc.blocks.map((b) => (r.linkedBlockIds.includes(b.id) && !b.objectiveIds.includes(r.objective.id) ? { ...b, objectiveIds: [...b.objectiveIds, r.objective.id] } : b)),
  };
}

export function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

/* ───────── helpers for activity / cards / summary ───────── */

export function activitySteps(a: ActivityBlock): string[] {
  return a.steps
    .split('\n')
    .map((s) => s.replace(/^\s*(?:\d+[.)-]|[-•*])\s*/, '').trim())
    .filter(Boolean);
}

export function filledCards(b: CardsBlock): FlashCard[] {
  return b.cards.filter((c) => c.front.trim() || c.back.trim());
}

export function filledPoints(b: SummaryBlock): SummaryPoint[] {
  return b.points.filter((p) => p.title.trim() || p.text.trim());
}

export function referencedAssetIds(doc: LessonDoc): Set<string> {
  const ids = new Set<string>();
  for (const b of doc.blocks) if ((b.type === 'image' || b.type === 'audio' || b.type === 'video' || b.type === 'file') && b.assetId) ids.add(b.assetId);
  return ids;
}

/* ───────── alignment ───────── */

export type CoverageStatus = 'covered' | 'partial' | 'uncovered';

export interface ObjectiveCoverage {
  objective: Objective;
  index: number;
  contentBlockIds: string[];
  practiceBlockIds: string[];
  status: CoverageStatus;
}

export interface AlignmentReport {
  rows: ObjectiveCoverage[];
  /** Content and practice blocks not tied to any objective (headings are ignored). */
  unlinkedBlockIds: string[];
  uncovered: number;
  partial: number;
}

/**
 * covered   = at least one content block AND one practice block (activity or cards)
 * partial   = only content, or only practice
 * uncovered = nothing in the lesson serves this objective
 */
export function alignment(doc: LessonDoc): AlignmentReport {
  const rows = doc.objectives.map((objective, index) => {
    const linked = doc.blocks.filter((b) => b.objectiveIds.includes(objective.id));
    const contentBlockIds = linked.filter((b) => BLOCK_META[b.type].role === 'content').map((b) => b.id);
    const practiceBlockIds = linked.filter((b) => BLOCK_META[b.type].role === 'practice').map((b) => b.id);
    const status: CoverageStatus =
      contentBlockIds.length && practiceBlockIds.length ? 'covered' : contentBlockIds.length || practiceBlockIds.length ? 'partial' : 'uncovered';
    return { objective, index, contentBlockIds, practiceBlockIds, status };
  });
  const unlinkedBlockIds = doc.blocks.filter((b) => BLOCK_META[b.type].role !== 'structure' && b.objectiveIds.length === 0).map((b) => b.id);
  return {
    rows,
    unlinkedBlockIds,
    uncovered: rows.filter((r) => r.status === 'uncovered').length,
    partial: rows.filter((r) => r.status === 'partial').length,
  };
}

/** A short human label for a block, used in the matrix and link pickers. */
export function blockLabel(b: Block): string {
  const t =
    b.type === 'heading' || b.type === 'text'
      ? b.text
      : b.type === 'image'
        ? b.caption || b.alt
        : b.title;
  const clean = (t ?? '')
    .replace(/\*\*/g, '')
    .replace(/^\s*(?:[-•*]|\d+[.)])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean ? (clean.length > 48 ? `${clean.slice(0, 46)}…` : clean) : BLOCK_META[b.type].label;
}

export function lessonMinutes(doc: LessonDoc): number {
  return doc.blocks.reduce((s, b) => s + (b.type === 'activity' ? b.duration : 0), 0);
}
