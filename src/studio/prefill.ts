import { objectiveStatement } from '../lesson/bloom';
import { filledCards, filledPoints } from '../lesson/model';
import type { LessonDoc } from '../lesson/types';
import { autoLayout, CANVAS, connect, LIMITS, newCard, newNode, newPoint } from './model';
import type { CardsData, ConceptMapData, DesignKind, SummaryData } from './types';

export interface PrefillSource {
  title: string;
  doc: LessonDoc;
}

/** What "start from the lesson" can take from a lesson for each kind of design (counts shown before creating). */
export function prefillCounts(src: PrefillSource): Record<DesignKind, number> {
  const cards = src.doc.blocks.flatMap((b) => (b.type === 'cards' ? filledCards(b) : [])).length;
  const summary = src.doc.blocks.find((b) => b.type === 'summary');
  const points = summary && summary.type === 'summary' ? filledPoints(summary).length : objectives(src).length;
  return { cards, summary: points, conceptmap: mapTopics(src).length };
}

const objectives = (src: PrefillSource) => src.doc.objectives.map((o) => objectiveStatement(o, src.doc.audience)).filter(Boolean);
const mapTopics = (src: PrefillSource) => {
  const headings = src.doc.blocks.filter((b) => b.type === 'heading' && b.level === 2 && b.text.trim()).map((b) => (b.type === 'heading' ? b.text.trim() : ''));
  return headings.length ? headings : src.doc.objectives.map((o) => o.content.trim()).filter(Boolean);
};

export function prefill(kind: DesignKind, src: PrefillSource): CardsData | SummaryData | ConceptMapData | null {
  if (kind === 'cards') {
    const cards = src.doc.blocks.flatMap((b) => (b.type === 'cards' ? filledCards(b) : [])).slice(0, LIMITS.cards);
    return cards.length ? { cards: cards.map((c) => newCard(c.front, c.back)), show: 'both', columns: 2 } : null;
  }
  if (kind === 'summary') {
    const s = src.doc.blocks.find((b) => b.type === 'summary');
    if (s && s.type === 'summary' && filledPoints(s).length) {
      return {
        heading: s.title.trim() || src.title,
        subtitle: '',
        style: s.style === 'steps' ? 'steps' : s.style === 'central' ? 'central' : 'grid',
        points: filledPoints(s).slice(0, LIMITS.points).map((p) => newPoint(p.title, p.text)),
      };
    }
    const obj = objectives(src);
    return obj.length ? { heading: src.title, subtitle: 'أهداف الدرس', style: 'steps', points: obj.slice(0, LIMITS.points).map((o) => newPoint(o, '')) } : null;
  }
  const topics = mapTopics(src).slice(0, LIMITS.nodes - 1);
  if (!topics.length) return null;
  const root = newNode(src.title, CANVAS.width / 2, CANVAS.height / 2, 0, 'ellipse');
  let map: ConceptMapData = { nodes: [root], edges: [] };
  for (const t of topics) {
    const n = newNode(t, 0, 0, 1);
    map = { ...map, nodes: [...map.nodes, n] };
    map = connect(map, root.id, n.id, 'يشمل').map;
  }
  return autoLayout(map);
}
