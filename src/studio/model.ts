import { newId } from '../db/ids';
import type { CardItem, CardsData, ConceptMapData, Design, DesignKind, DesignTheme, MapEdge, MapNode, NodeShape, SummaryData, SummaryItem, SummaryStyle } from './types';

export const KIND_LABEL: Record<DesignKind, string> = {
  cards: 'بطاقات تعليمية',
  summary: 'ملخص بصري',
  conceptmap: 'خريطة مفاهيم',
};

export const KIND_HINT: Record<DesignKind, string> = {
  cards: 'وجه وظهر لكل بطاقة: مصطلح وتعريفه، أو سؤال وجوابه',
  summary: 'فكرة رئيسية ونقاط بأربعة أشكال: شبكة، خطوات، مركزية، خط زمني',
  conceptmap: 'مفاهيم تُسحب بحرية، وأسهم بينها عليها كلمات الربط',
};

export const LIMITS = { title: 120, text: 300, longText: 600, cards: 24, points: 12, nodes: 40, edges: 80, label: 60 };

/** Logical canvas of the concept map; the editor scales it to the screen. */
export const CANVAS = { width: 960, height: 640 };

export interface Theme {
  label: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  /** Text on the accent colour. */
  onAccent: string;
  line: string;
  dark: boolean;
}

/** Every text/background pair below meets WCAG AA (4.5:1) for normal text. */
export const THEMES: Record<DesignTheme, Theme> = {
  brand: { label: 'هوية IBRAHI8M', bg: '#0E1014', surface: '#171B22', text: '#E6E9EE', muted: '#9AA3AF', accent: '#2563EB', onAccent: '#FFFFFF', line: '#5B6472', dark: true },
  paper: { label: 'ورقي فاتح', bg: '#FFFFFF', surface: '#F1F4F8', text: '#111827', muted: '#4B5563', accent: '#1D4ED8', onAccent: '#FFFFFF', line: '#9CA3AF', dark: false },
  ocean: { label: 'محيط', bg: '#082F49', surface: '#0C4A6E', text: '#F0F9FF', muted: '#BAE6FD', accent: '#0369A1', onAccent: '#FFFFFF', line: '#38BDF8', dark: true },
  forest: { label: 'غابة', bg: '#052E16', surface: '#14532D', text: '#F0FDF4', muted: '#BBF7D0', accent: '#15803D', onAccent: '#FFFFFF', line: '#4ADE80', dark: true },
  sunset: { label: 'غروب', bg: '#FFF7ED', surface: '#FFEDD5', text: '#431407', muted: '#9A3412', accent: '#C2410C', onAccent: '#FFFFFF', line: '#FB923C', dark: false },
  violet: { label: 'بنفسجي', bg: '#1E1B4B', surface: '#312E81', text: '#EEF2FF', muted: '#C7D2FE', accent: '#6D28D9', onAccent: '#FFFFFF', line: '#A78BFA', dark: true },
};

export const THEME_KEYS = Object.keys(THEMES) as DesignTheme[];

/** Concept-map node colours: white text on each (contrast ≥ 4.5:1). Index 0 follows the theme accent. */
export const NODE_COLORS = ['accent', '#1D4ED8', '#0F766E', '#15803D', '#B45309', '#6D28D9', '#BE123C'] as const;
export const NODE_COLOR_LABEL = ['لون القالب', 'أزرق', 'فيروزي', 'أخضر', 'كهرماني', 'بنفسجي', 'أحمر'];

export function nodeFill(theme: Theme, color: number): string {
  const c = NODE_COLORS[color] ?? 'accent';
  return c === 'accent' ? theme.accent : c;
}

export const SHAPE_LABEL: Record<NodeShape, string> = { rounded: 'مستطيل بحواف دائرية', ellipse: 'بيضاوي', rect: 'مستطيل' };
export const STYLE_LABEL: Record<SummaryStyle, string> = { grid: 'شبكة', steps: 'خطوات متسلسلة', central: 'فكرة مركزية', timeline: 'خط زمني' };

/* ───────── factories ───────── */

export const newCard = (front = '', back = ''): CardItem => ({ id: newId(), front, back });
export const newPoint = (title = '', text = ''): SummaryItem => ({ id: newId(), title, text });

export function newNode(text: string, x: number, y: number, color = 0, shape: NodeShape = 'rounded'): MapNode {
  return { id: newId(), text, x: Math.round(x), y: Math.round(y), color, shape };
}

export function emptyData(kind: DesignKind): Design['data'] {
  switch (kind) {
    case 'cards':
      return { cards: [newCard(), newCard()], show: 'both', columns: 2 } satisfies CardsData;
    case 'summary':
      return { heading: '', subtitle: '', style: 'grid', points: [newPoint(), newPoint(), newPoint()] } satisfies SummaryData;
    case 'conceptmap':
      return { nodes: [newNode('', CANVAS.width / 2, CANVAS.height / 2, 0, 'ellipse')], edges: [] } satisfies ConceptMapData;
  }
}

export function newDesign(projectId: string, lessonId: string | null, kind: DesignKind, title: string, data?: Design['data']): Design {
  const now = Date.now();
  return {
    id: newId(),
    projectId,
    lessonId,
    kind,
    title: title.trim().slice(0, LIMITS.title),
    theme: 'brand',
    data: data ?? emptyData(kind),
    rev: 0,
    createdAt: now,
    updatedAt: now,
  } as Design;
}

/* ───────── defensive loading ───────── */

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const idOf = (v: unknown) => (typeof v === 'string' && v ? v : newId());
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []) as Record<string, unknown>[];

function normCards(r: Record<string, unknown>): CardsData {
  return {
    cards: list(r.cards)
      .slice(0, LIMITS.cards)
      .map((c) => ({ id: idOf(c.id), front: str(c.front, LIMITS.text), back: str(c.back, LIMITS.longText) })),
    show: r.show === 'front' ? 'front' : 'both',
    columns: r.columns === 1 || r.columns === 3 ? r.columns : 2,
  };
}

function normSummary(r: Record<string, unknown>): SummaryData {
  const style: SummaryStyle = r.style === 'steps' || r.style === 'central' || r.style === 'timeline' ? r.style : 'grid';
  return {
    heading: str(r.heading, LIMITS.text),
    subtitle: str(r.subtitle, LIMITS.longText),
    style,
    points: list(r.points)
      .slice(0, LIMITS.points)
      .map((p) => ({ id: idOf(p.id), title: str(p.title, LIMITS.text), text: str(p.text, LIMITS.longText) })),
  };
}

function normMap(r: Record<string, unknown>): ConceptMapData {
  const nodes: MapNode[] = list(r.nodes)
    .slice(0, LIMITS.nodes)
    .map((n) => ({
      id: idOf(n.id),
      text: str(n.text, LIMITS.text),
      x: Math.round(num(n.x, 0, CANVAS.width, CANVAS.width / 2)),
      y: Math.round(num(n.y, 0, CANVAS.height, CANVAS.height / 2)),
      color: Math.round(num(n.color, 0, NODE_COLORS.length - 1, 0)),
      shape: n.shape === 'ellipse' || n.shape === 'rect' ? n.shape : 'rounded',
    }));
  const ids = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const edges: MapEdge[] = [];
  for (const e of list(r.edges)) {
    const from = str(e.from, 100);
    const to = str(e.to, 100);
    const key = `${from}>${to}`;
    if (!ids.has(from) || !ids.has(to) || from === to || seen.has(key) || edges.length >= LIMITS.edges) continue;
    seen.add(key);
    edges.push({ id: idOf(e.id), from, to, label: str(e.label, LIMITS.label) });
  }
  return { nodes, edges };
}

export function normalizeDesign(raw: unknown): Design | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.projectId !== 'string') return null;
  const kind: DesignKind | null = r.kind === 'cards' || r.kind === 'summary' || r.kind === 'conceptmap' ? r.kind : null;
  if (!kind) return null;
  const d = (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown>;
  const data = kind === 'cards' ? normCards(d) : kind === 'summary' ? normSummary(d) : normMap(d);
  return {
    id: r.id,
    projectId: r.projectId,
    lessonId: typeof r.lessonId === 'string' && r.lessonId ? r.lessonId : null,
    kind,
    title: str(r.title, LIMITS.title),
    theme: THEME_KEYS.includes(r.theme as DesignTheme) ? (r.theme as DesignTheme) : 'brand',
    data,
    rev: Number.isInteger(r.rev) && (r.rev as number) >= 0 ? (r.rev as number) : 0,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
  } as Design;
}

/* ───────── what a design still needs ───────── */

export function designIssues(d: Design): string[] {
  const out: string[] = [];
  if (!d.title.trim()) out.push('اكتب عنوان التصميم.');
  if (d.kind === 'cards') {
    const filled = d.data.cards.filter((c) => c.front.trim() || c.back.trim());
    if (!filled.length) out.push('اكتب بطاقة واحدة على الأقل.');
    if (d.data.cards.some((c) => (c.front.trim() || c.back.trim()) && !c.front.trim())) out.push('بطاقة لها ظهر بلا وجه.');
  }
  if (d.kind === 'summary') {
    if (!d.data.heading.trim()) out.push('اكتب الفكرة الرئيسية.');
    if (!d.data.points.some((p) => p.title.trim() || p.text.trim())) out.push('اكتب نقطة واحدة على الأقل.');
  }
  if (d.kind === 'conceptmap') {
    if (d.data.nodes.some((n) => !n.text.trim())) out.push('يوجد مفهوم بلا نص.');
    if (d.data.nodes.length > 1 && !d.data.edges.length) out.push('اربط المفاهيم بأسهم.');
    const linked = new Set(d.data.edges.flatMap((e) => [e.from, e.to]));
    const lonely = d.data.nodes.length > 1 ? d.data.nodes.filter((n) => !linked.has(n.id)).length : 0;
    if (lonely && d.data.edges.length) out.push(lonely === 1 ? 'مفهوم واحد غير مربوط بغيره.' : `${lonely} مفاهيم غير مربوطة بغيرها.`);
  }
  return out;
}

/** Items that are actually shown (empty ones are skipped in the picture). */
export const shownCards = (d: CardsData) => d.cards.filter((c) => c.front.trim() || c.back.trim());
export const shownPoints = (d: SummaryData) => d.points.filter((p) => p.title.trim() || p.text.trim());

/* ───────── concept map operations (pure) ───────── */

const clampX = (x: number) => Math.round(Math.min(CANVAS.width - 70, Math.max(70, x)));
const clampY = (y: number) => Math.round(Math.min(CANVAS.height - 36, Math.max(36, y)));

export function moveNode(m: ConceptMapData, id: string, x: number, y: number): ConceptMapData {
  return { ...m, nodes: m.nodes.map((n) => (n.id === id ? { ...n, x: clampX(x), y: clampY(y) } : n)) };
}

export function updateNode(m: ConceptMapData, id: string, patch: Partial<Omit<MapNode, 'id'>>): ConceptMapData {
  return { ...m, nodes: m.nodes.map((n) => (n.id === id ? { ...n, ...patch, id: n.id } : n)) };
}

/** A free spot near `near` (or the centre) on a spiral, away from existing nodes. */
export function freeSpot(m: ConceptMapData, near?: { x: number; y: number }): { x: number; y: number } {
  const cx = near?.x ?? CANVAS.width / 2;
  const cy = near?.y ?? CANVAS.height / 2;
  for (let i = 1; i < 400; i++) {
    const a = i * 0.9;
    const r = 110 + i * 8;
    const x = clampX(cx + Math.cos(a) * r * 1.4);
    const y = clampY(cy + Math.sin(a) * r * 0.8);
    if (m.nodes.every((n) => Math.abs(n.x - x) > 190 || Math.abs(n.y - y) > 80)) return { x, y };
  }
  return { x: clampX(cx + 40), y: clampY(cy + 40) };
}

export function addNode(m: ConceptMapData, text: string, opts: { near?: string; x?: number; y?: number; color?: number } = {}): { map: ConceptMapData; node: MapNode | null } {
  if (m.nodes.length >= LIMITS.nodes) return { map: m, node: null };
  const anchor = opts.near ? m.nodes.find((n) => n.id === opts.near) : undefined;
  const spot = opts.x !== undefined && opts.y !== undefined ? { x: clampX(opts.x), y: clampY(opts.y) } : freeSpot(m, anchor);
  const node = newNode(text, spot.x, spot.y, opts.color ?? (anchor ? Math.min(anchor.color + 1, NODE_COLORS.length - 1) : 1));
  return { map: { ...m, nodes: [...m.nodes, node] }, node };
}

export type ConnectResult = { map: ConceptMapData; edge: MapEdge | null; problem?: 'self' | 'exists' | 'limit' };

export function connect(m: ConceptMapData, from: string, to: string, label = ''): ConnectResult {
  if (from === to) return { map: m, edge: null, problem: 'self' };
  if (m.edges.some((e) => e.from === from && e.to === to)) return { map: m, edge: null, problem: 'exists' };
  if (m.edges.length >= LIMITS.edges) return { map: m, edge: null, problem: 'limit' };
  const edge: MapEdge = { id: newId(), from, to, label: label.slice(0, LIMITS.label) };
  return { map: { ...m, edges: [...m.edges, edge] }, edge };
}

export function updateEdge(m: ConceptMapData, id: string, patch: Partial<Pick<MapEdge, 'label'>>): ConceptMapData {
  return { ...m, edges: m.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

/** Reverses an arrow (keeps its words). */
export function flipEdge(m: ConceptMapData, id: string): ConceptMapData {
  const e = m.edges.find((x) => x.id === id);
  if (!e || m.edges.some((x) => x.from === e.to && x.to === e.from)) return m;
  return { ...m, edges: m.edges.map((x) => (x.id === id ? { ...x, from: e.to, to: e.from } : x)) };
}

export function removeEdge(m: ConceptMapData, id: string): ConceptMapData {
  return { ...m, edges: m.edges.filter((e) => e.id !== id) };
}

/** Removes a node and every arrow touching it; returns what was removed, for undo. */
export function removeNode(m: ConceptMapData, id: string): { map: ConceptMapData; node: MapNode | null; edges: MapEdge[]; index: number } {
  const index = m.nodes.findIndex((n) => n.id === id);
  if (index < 0) return { map: m, node: null, edges: [], index };
  const edges = m.edges.filter((e) => e.from === id || e.to === id);
  return { map: { nodes: m.nodes.filter((n) => n.id !== id), edges: m.edges.filter((e) => e.from !== id && e.to !== id) }, node: m.nodes[index], edges, index };
}

export function restoreNode(m: ConceptMapData, node: MapNode, edges: MapEdge[], index: number): ConceptMapData {
  const nodes = m.nodes.slice();
  nodes.splice(Math.max(0, Math.min(index, nodes.length)), 0, node);
  const ids = new Set(nodes.map((n) => n.id));
  return { nodes, edges: [...m.edges, ...edges.filter((e) => ids.has(e.from) && ids.has(e.to))] };
}

/**
 * Tidy layout: the first node (or the most connected one) in the centre, its direct
 * neighbours on a ring, the rest on an outer ring near their parent. Deterministic.
 */
export function autoLayout(m: ConceptMapData): ConceptMapData {
  if (!m.nodes.length) return m;
  const degree = new Map(m.nodes.map((n) => [n.id, 0]));
  for (const e of m.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const root = m.nodes[0];
  const neighbours = (id: string) => m.edges.filter((e) => e.from === id || e.to === id).map((e) => (e.from === id ? e.to : e.from));
  const level = new Map<string, number>([[root.id, 0]]);
  const parent = new Map<string, string>();
  const queue = [root.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const nb of neighbours(id)) {
      if (level.has(nb)) continue;
      level.set(nb, level.get(id)! + 1);
      parent.set(nb, id);
      queue.push(nb);
    }
  }
  for (const n of m.nodes) if (!level.has(n.id)) level.set(n.id, 2);
  const cx = CANVAS.width / 2;
  const cy = CANVAS.height / 2;
  const pos = new Map<string, { x: number; y: number }>([[root.id, { x: cx, y: cy }]]);
  const ring1 = m.nodes.filter((n) => level.get(n.id) === 1);
  ring1.forEach((n, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, ring1.length)) * Math.PI * 2;
    pos.set(n.id, { x: cx + Math.cos(a) * 250, y: cy + Math.sin(a) * 170 });
  });
  const outer = m.nodes.filter((n) => (level.get(n.id) ?? 2) >= 2);
  outer.forEach((n, i) => {
    const p = parent.get(n.id);
    const base = p && pos.get(p) ? Math.atan2((pos.get(p)!.y - cy) / 170, (pos.get(p)!.x - cx) / 250) : (i / Math.max(1, outer.length)) * Math.PI * 2;
    const spread = ((i % 3) - 1) * 0.35;
    const a = base + spread;
    pos.set(n.id, { x: cx + Math.cos(a) * 400, y: cy + Math.sin(a) * 265 });
  });
  return { ...m, nodes: m.nodes.map((n) => ({ ...n, x: clampX(pos.get(n.id)!.x), y: clampY(pos.get(n.id)!.y) })) };
}
