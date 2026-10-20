import { memo } from 'react';
import { DesignSvg } from './render';
import type { Design } from './types';

/** Small picture of a design for lists (the real SVG, scaled down by CSS). */
export const DesignThumb = memo(function DesignThumb({ design }: { design: Design }) {
  return <DesignSvg design={design} />;
});
