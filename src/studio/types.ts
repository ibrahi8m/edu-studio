/** Phase 5: design studio. Stored in the `designs` table, one row per design. */

export type DesignKind = 'cards' | 'summary' | 'conceptmap';

/** Colour themes shared by every design (all checked for text contrast). */
export type DesignTheme = 'brand' | 'ocean' | 'forest' | 'sunset' | 'violet' | 'paper';

export interface CardItem {
  id: string;
  /** Front: term, question or idea. */
  front: string;
  /** Back: definition, answer or explanation. */
  back: string;
}

export interface CardsData {
  cards: CardItem[];
  /** Sheet layout: each card shows front and back side by side, or fronts only (for guessing). */
  show: 'both' | 'front';
  /** Cards per row in the exported sheet. */
  columns: 1 | 2 | 3;
}

export type SummaryStyle = 'grid' | 'steps' | 'central' | 'timeline';

export interface SummaryItem {
  id: string;
  title: string;
  text: string;
}

export interface SummaryData {
  /** The main idea, shown large (or in the centre). */
  heading: string;
  subtitle: string;
  style: SummaryStyle;
  points: SummaryItem[];
}

export type NodeShape = 'rounded' | 'ellipse' | 'rect';

export interface MapNode {
  id: string;
  text: string;
  /** Centre of the node in canvas units (0..CANVAS.width, 0..CANVAS.height). */
  x: number;
  y: number;
  /** Index into the theme's node palette (0 = main colour). */
  color: number;
  shape: NodeShape;
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  /** Linking words written on the arrow, e.g. «يتكوّن من». */
  label: string;
}

export interface ConceptMapData {
  nodes: MapNode[];
  edges: MapEdge[];
}

interface DesignBase {
  id: string;
  projectId: string;
  /** Optional lesson the design belongs to. */
  lessonId: string | null;
  title: string;
  theme: DesignTheme;
  /** Bumps on every save; guards against two windows overwriting each other. */
  rev: number;
  createdAt: number;
  updatedAt: number;
}

export interface CardsDesign extends DesignBase {
  kind: 'cards';
  data: CardsData;
}
export interface SummaryDesign extends DesignBase {
  kind: 'summary';
  data: SummaryData;
}
export interface ConceptMapDesign extends DesignBase {
  kind: 'conceptmap';
  data: ConceptMapData;
}

export type Design = CardsDesign | SummaryDesign | ConceptMapDesign;
