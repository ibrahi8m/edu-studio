/** Lesson content model (phase 2). Stored per lesson in the `lessonDocs` table. */

export type BloomLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** A measurable objective written as: أن + فعل + الفئة + المحتوى + الشرط + المعيار. */
export interface Objective {
  id: string;
  /** 0 = not classified yet. */
  level: BloomLevel | 0;
  verb: string;
  content: string;
  condition: string;
  criterion: string;
}

interface BlockBase {
  id: string;
  /** Objectives this block serves — drives the alignment matrix. */
  objectiveIds: string[];
}

export interface HeadingBlock extends BlockBase {
  type: 'heading';
  text: string;
  level: 2 | 3;
}

export interface TextBlock extends BlockBase {
  type: 'text';
  text: string;
}

export interface ImageBlock extends BlockBase {
  type: 'image';
  assetId: string | null;
  alt: string;
  /** Purely decorative images may have no alt text. */
  decorative: boolean;
  caption: string;
}

export interface AudioBlock extends BlockBase {
  type: 'audio';
  assetId: string | null;
  title: string;
  transcript: string;
}

export interface VideoBlock extends BlockBase {
  type: 'video';
  assetId: string | null;
  title: string;
  transcript: string;
}

export interface FlashCard {
  id: string;
  front: string;
  back: string;
}

export interface CardsBlock extends BlockBase {
  type: 'cards';
  title: string;
  cards: FlashCard[];
}

export type SummaryStyle = 'grid' | 'steps' | 'central';

export interface SummaryPoint {
  id: string;
  title: string;
  text: string;
}

export interface SummaryBlock extends BlockBase {
  type: 'summary';
  title: string;
  style: SummaryStyle;
  points: SummaryPoint[];
}

export type Grouping = 'individual' | 'pairs' | 'groups' | 'class';

export interface ActivityBlock extends BlockBase {
  type: 'activity';
  title: string;
  grouping: Grouping;
  duration: number;
  /** One step per line. */
  steps: string;
  materials: string;
  output: string;
}

export type Block = HeadingBlock | TextBlock | ImageBlock | AudioBlock | VideoBlock | CardsBlock | SummaryBlock | ActivityBlock;
export type BlockType = Block['type'];

export interface LessonDoc {
  lessonId: string;
  schema: 1;
  /** Revision counter: bumps on every save, guards against two windows overwriting each other. */
  rev: number;
  audience: string;
  objectives: Objective[];
  strategies: string[];
  strategyNotes: string;
  assessmentTypes: string[];
  assessmentTools: string[];
  assessmentNotes: string;
  blocks: Block[];
  updatedAt: number;
}

export type AssetKind = 'image' | 'audio' | 'video';

/** A media file stored inside IndexedDB, so it works offline and survives restarts. */
export interface Asset {
  id: string;
  lessonId: string;
  kind: AssetKind;
  mime: string;
  name: string;
  size: number;
  width?: number;
  height?: number;
  /** Raw bytes (ArrayBuffer clones reliably across Chromium, Safari and Electron). */
  data: ArrayBuffer;
  createdAt: number;
}
