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

/**
 * Who an activity is for (1.1.0). «core» = everyone. «remedial» / «enrichment» are shown to a learner
 * only by a stated rule on their quiz result for the lesson (see student/tracks.ts).
 */
export type ActivityTrack = 'core' | 'remedial' | 'enrichment';

export interface ActivityBlock extends BlockBase {
  type: 'activity';
  title: string;
  grouping: Grouping;
  duration: number;
  /** One step per line. */
  steps: string;
  materials: string;
  output: string;
  /** 1.1.0: core / remedial / enrichment (older lessons: core). */
  track: ActivityTrack;
  /** 1.1.0: the learner writes an answer (and may attach files) and submits it — an assignment. */
  submit: boolean;
}

/** 1.1.0: a file the learner can open or download (PDF, Word, PowerPoint, Excel, text, zip). */
export interface FileBlock extends BlockBase {
  type: 'file';
  assetId: string | null;
  title: string;
  description: string;
}

export type Block = HeadingBlock | TextBlock | ImageBlock | AudioBlock | VideoBlock | CardsBlock | SummaryBlock | ActivityBlock | FileBlock;
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

export type AssetKind = 'image' | 'audio' | 'video' | 'file';

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
