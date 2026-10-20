import { activitySteps, filledCards } from '../lesson/model';
import type { Block, LessonDoc } from '../lesson/types';
import type { LessonProgress } from './types';

export interface LessonSection {
  /** 'intro', 'end', or the id of the block that starts the section. */
  id: string;
  title: string;
  kind: 'intro' | 'content' | 'end';
  blocks: Block[];
}

const hasContent = (b: Block) => {
  switch (b.type) {
    case 'heading':
    case 'text':
      return b.text.trim().length > 0;
    default:
      return true;
  }
};

/**
 * Splits a lesson into the parts a student moves through:
 * the start (title and objectives), one part per main heading (H2), and the end (linked quizzes).
 * Content before the first main heading becomes its own part.
 */
export function lessonSections(doc: LessonDoc): LessonSection[] {
  const out: LessonSection[] = [{ id: 'intro', title: 'البداية والأهداف', kind: 'intro', blocks: [] }];
  let cur: LessonSection | null = null;
  for (const b of doc.blocks) {
    if (!hasContent(b)) continue;
    if (b.type === 'heading' && b.level === 2) {
      cur = { id: b.id, title: b.text.trim(), kind: 'content', blocks: [] };
      out.push(cur);
      continue;
    }
    if (!cur) {
      cur = { id: `s:${b.id}`, title: 'المحتوى', kind: 'content', blocks: [] };
      out.push(cur);
    }
    cur.blocks.push(b);
  }
  out.push({ id: 'end', title: 'الختام والاختبارات', kind: 'end', blocks: [] });
  return out;
}

export interface ProgressSummary {
  sections: number;
  visited: number;
  /** 0–1 share of the sections opened. */
  fraction: number;
  activitySteps: number;
  activityDone: number;
  cards: number;
  cardsSeen: number;
  completed: boolean;
}

/** Progress measured against the lesson as it is now (sections or steps removed later no longer count). */
export function summarizeProgress(doc: LessonDoc, p: LessonProgress | null | undefined): ProgressSummary {
  const sections = lessonSections(doc);
  const ids = new Set(sections.map((s) => s.id));
  const visited = p ? p.visited.filter((v) => ids.has(v)).length : 0;
  let steps = 0;
  let stepsDone = 0;
  let cards = 0;
  let cardsSeen = 0;
  for (const b of doc.blocks) {
    if (b.type === 'activity') {
      const n = activitySteps(b).length;
      steps += n;
      stepsDone += (p?.activities[b.id] ?? []).filter((i) => i >= 0 && i < n).length;
    }
    if (b.type === 'cards') {
      const list = filledCards(b);
      cards += list.length;
      const seen = new Set(p?.cards[b.id] ?? []);
      cardsSeen += list.filter((c) => seen.has(c.id)).length;
    }
  }
  return {
    sections: sections.length,
    visited,
    fraction: sections.length ? visited / sections.length : 0,
    activitySteps: steps,
    activityDone: stepsDone,
    cards,
    cardsSeen,
    completed: !!p?.completedAt,
  };
}
