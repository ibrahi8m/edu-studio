/**
 * 1.4.0 — the single reference for the brand identities used by the AI Design Studio.
 *
 * Every fact below was read from the project's own files, not invented:
 *  - the mark:      public/brand/ibrahi8m-mark.svg (512×512 grid) and ibrahi8m-glyph.svg (same artwork, no tile)
 *  - the wordmark:  src/components/Brand.tsx (Wordmark, Eight, BrandLockup) + src/styles/global.css (.wordmark…)
 *  - the colours:   the SVG fills/gradients and src/styles/tokens.css (--silver-1..3, --accent-strong)
 * When the artwork changes, change it here only; the prompt engine and the tests read this file.
 *
 * The prompt must be SELF-CONTAINED: the owner pastes it into ChatGPT, which has no project files.
 * So the text describes the logo instead of pointing to a file name or path.
 */

export interface BrandColor {
  hex: string;
  role: string;
}

export interface IdentitySpec {
  id: 'ibrahi8m' | 'brand-edu-studio' | 'brand-ai-universe';
  /** The exact name as written in the project. */
  name: string;
  /** How the name must be spelled, for the image model. */
  spelling: string;
  /** True only for facts read from an artwork file in the project. */
  hasLogoArtwork: boolean;
  source: string;
}

/** The owner's mark (the figure-8 robot) — the logo that every prompt must carry. */
export const IBRAHI8M_MARK = {
  name: 'IBRAHI8M',
  spelling: 'I-B-R-A-H-I-8-M: capital Latin letters with the digit 8 as the seventh character (never "IBRAHIM")',
  source: 'public/brand/ibrahi8m-mark.svg, public/brand/ibrahi8m-glyph.svg, src/components/Brand.tsx',
  colors: {
    tile: { hex: '#0E1014', role: 'near-black tile behind the symbol' },
    head: { hex: '#171B22', role: 'dark graphite face of the robot head' },
    visor: { hex: '#06080B', role: 'black visor band' },
    silverLight: { hex: '#F2F4F7', role: 'metallic silver gradient, light end' },
    silverMid: { hex: '#A9B1BC', role: 'metallic silver gradient, middle' },
    silverDark: { hex: '#5D6673', role: 'metallic silver gradient, dark end' },
    blue: { hex: '#2F7BFF', role: 'electric blue: lower ring, visor outline, eye glow' },
    blueLight: { hex: '#5B9BFF', role: 'light electric blue: circuit traces and nodes' },
    eyeCore: { hex: '#E3EEFF', role: 'near-white hot centre of each glowing light' },
  } satisfies Record<string, BrandColor>,
  /** Measured on the 512×512 grid of ibrahi8m-mark.svg. */
  geometry: {
    tileCornerRadiusPct: 22, // rx 112 / 512
    upperLoopOuterDiameterPct: 44, // r 100 + stroke 24 → 224 / 512
    lowerLoopOuterDiameterPct: 40, // r 90 + stroke 26 → 206 / 512
    upperCentreYPct: 34, // cy 174 / 512
    lowerCentreYPct: 70, // cy 356 / 512
    visorWidthOfHeadPct: 70, // 156 / 224
  },
} as const;

export const IDENTITIES: Record<IdentitySpec['id'], IdentitySpec> = {
  ibrahi8m: { id: 'ibrahi8m', name: 'IBRAHI8M', spelling: IBRAHI8M_MARK.spelling, hasLogoArtwork: true, source: IBRAHI8M_MARK.source },
  'brand-edu-studio': {
    id: 'brand-edu-studio',
    name: 'IBRAHI8M EDU STUDIO',
    spelling: '"IBRAHI8M" as above, with the secondary line "EDU STUDIO"',
    hasLogoArtwork: true,
    source: `${IBRAHI8M_MARK.source}, BrandLockup`,
  },
  'brand-ai-universe': {
    id: 'brand-ai-universe',
    name: 'IBRAHIM AI UNIVERSE',
    spelling: '"IBRAHIM AI UNIVERSE" (this name is written with the letter M, as entered in the project)',
    // The project holds NO artwork for this identity; nothing about its look is invented here.
    hasLogoArtwork: false,
    source: 'src/aistudio/catalog.ts (name and tone only)',
  },
};

const C = IBRAHI8M_MARK.colors;
const G = IBRAHI8M_MARK.geometry;

/** The mark, described for an image model. Plain English, no file names. */
export function markDescription(): string {
  return [
    `SYMBOL: a vertical figure "8" built from two stacked rings, centred on a square app-icon tile (1:1) with rounded corners (corner radius about ${G.tileCornerRadiusPct}% of the side), tile color ${C.tile.hex}, edged by a very thin metallic silver outline at low opacity.`,
    `Upper loop = a robot head: a circle about ${G.upperLoopOuterDiameterPct}% of the tile width, face ${C.head.hex}, framed by a thick metallic silver ring (gradient ${C.silverLight.hex} → ${C.silverMid.hex} → ${C.silverDark.hex}, light at top-left, dark at bottom-right).`,
    `Inside it, a horizontal rounded visor (a pill shape about ${G.visorWidthOfHeadPct}% of the head width) in ${C.visor.hex} with a thin ${C.blue.hex} outline, holding two round glowing eyes side by side: hot near-white centres ${C.eyeCore.hex} fading to ${C.blueLight.hex} and ${C.blue.hex}, with a soft blue glow.`,
    `On top of the head, a short straight silver antenna ending in a small glowing blue ball.`,
    `Lower loop = a circuit ring: a slightly smaller thick ring (about ${G.lowerLoopOuterDiameterPct}% of the tile width) in solid electric blue ${C.blue.hex}, directly below the head.`,
    `Two thin circuit traces in ${C.blueLight.hex} with rounded ends leave the ring: from its left side straight out to the left, then up, ending in a round node; from its right side straight out to the right, then down, ending in a round node (the two traces mirror each other diagonally).`,
    `Where the two loops meet, a small glowing blue dot (the neck).`,
    `Upper loop centre at about ${G.upperCentreYPct}% and lower loop centre at about ${G.lowerCentreYPct}% of the tile height; flat vector style, crisp edges, no 3D extrusion, no extra elements.`,
  ].join(' ');
}

/** The wordmark (name) as drawn by the app. */
export function wordmarkDescription(secondLine: string | null): string {
  return [
    `NAME: "IBRAHI8M", spelled ${IBRAHI8M_MARK.spelling}.`,
    `Bold (700) geometric sans-serif capitals with slightly open letter spacing (about +6%), filled with a vertical metallic silver gradient (${C.silverLight.hex} at the top → ${C.silverMid.hex} → ${C.silverDark.hex} at the bottom).`,
    `The "8" is not a plain digit: it is a narrow miniature of the symbol at the same height as the capitals (a silver ring head with two blue eyes above an electric-blue ring, with a small blue dot between them) and a faint blue glow.`,
    secondLine
      ? `Lockup: the square symbol tile on the left, the name to its right, and under the name a smaller second line "${secondLine}" in medium-weight, widely spaced capitals (about +32% letter spacing) in grey-silver.`
      : 'Lockup: the square symbol tile on the left and the name to its right, with no second line.',
  ].join(' ');
}

/** Size and position guidance per design type (the user's chosen corner still wins). */
export const LOGO_SIZE_BY_TYPE: Record<string, string> = {
  social: 'about 10–12% of the image width',
  poster: 'about 10–14% of the width',
  cover: 'about 8–10% of the width, away from the title area',
  infographic: 'about 8–10% of the width, in the header or footer band, never over the data',
  educational: 'about 8–10% of the width, away from the teaching content',
  campaign: 'about 8–10% of the width, discreet and respectful, never over people',
  identity: 'large and central on at least one application, plus smaller placements elsewhere',
  commercial: 'about 10–12% of the width, near the offer or call to action',
  product: 'about 6–8% of the width, discreet, not printed on the product unless asked',
  architecture: 'about 5–7% of the width, as a clean signature corner outside the building',
  invitation: 'about 8–10% of the width, as an elegant signature at the bottom',
  thumbnail: 'about 12–15% of the width so it stays readable at small size',
  presentation: 'about 6–8% of the width, as a consistent slide signature',
};
export const LOGO_SIZE_DEFAULT = 'about 8–12% of the image width';
