import { ArrowDownUp, CircleDot, Combine, PenLine, TextCursorInput, ToggleLeft, type LucideIcon } from 'lucide-react';
import type { QuestionType } from '../types';

export const QTYPE_ICON: Record<QuestionType, LucideIcon> = {
  mcq: CircleDot,
  truefalse: ToggleLeft,
  short: PenLine,
  matching: Combine,
  ordering: ArrowDownUp,
  fill: TextCursorInput,
};
