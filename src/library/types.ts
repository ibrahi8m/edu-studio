/** Phase 6: the local library of reusable items. Stored in the `library` table. */
import type { Block, LessonDoc } from '../lesson/types';
import type { Design } from '../studio/types';

export type LibraryKind = 'lesson' | 'block' | 'design' | 'media';

/** Media in the library live in the `assets` table under this owner (not a lesson). */
export const LIBRARY_OWNER = 'library';

export interface LessonTemplateData {
  summary: string;
  duration: number;
  /** A lesson document; images/audio/video it uses are stored under LIBRARY_OWNER. */
  doc: LessonDoc;
}

export interface BlockTemplateData {
  blocks: Block[];
}

export interface DesignTemplateData {
  kind: Design['kind'];
  theme: Design['theme'];
  data: Design['data'];
}

export interface MediaItemData {
  assetId: string;
}

interface ItemBase {
  id: string;
  title: string;
  description: string;
  /** Free tags for filtering (subject, grade, strategy…). */
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export type LibraryItem =
  | (ItemBase & { kind: 'lesson'; data: LessonTemplateData })
  | (ItemBase & { kind: 'block'; data: BlockTemplateData })
  | (ItemBase & { kind: 'design'; data: DesignTemplateData })
  | (ItemBase & { kind: 'media'; data: MediaItemData });
