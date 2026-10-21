/** 1.1.0 — IBRAHI8M AI Design Studio: a local prompt writer. It writes prompts; it never generates images. */

export type PromptMode = 'quick' | 'pro' | 'brand';
export type DetailLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface PromptInput {
  /** The idea in Arabic or English. */
  idea: string;
  /** Optional English description of the subject; when filled it replaces the automatic translation. */
  subjectEn: string;
  type: string;
  goal: string;
  audience: string;
  platform: string;
  ratio: string;
  style: string;
  colors: string;
  lighting: string;
  background: string;
  angle: string;
  composition: string;
  textPlacement: string;
  logoPlacement: string;
  detail: DetailLevel;
  /** Exact texts that should appear on the design (kept in their own language). */
  texts: string;
  required: string;
  avoid: string;
}

export interface PromptOutput {
  promptEn: string;
  explanationAr: string;
  typeLabel: string;
  colors: string;
  ratio: string;
  texts: string[];
  negative: string;
  logoRules: string;
  /** Honest notes: untranslated words, identity clashes, missing fields. */
  warnings: string[];
}

export interface SavedPrompt {
  id: string;
  title: string;
  type: string;
  mode: PromptMode;
  brandId: string | null;
  input: PromptInput;
  output: PromptOutput;
  /** The prompt as edited by the user (empty = not edited). */
  editedPrompt: string;
  createdAt: number;
  updatedAt: number;
}

/** Saved rules of a visual identity, applied in «هوية العلامة» mode. */
export interface BrandKit {
  id: string;
  name: string;
  description: string;
  /** Colours as written by the user (names or hex codes), comma separated. */
  colors: string;
  fonts: string;
  tone: string;
  logoRules: string;
  rules: string;
  avoid: string;
  /** 1.2.0: the original logo file of this identity, when the app has it (shown and named in prompts). */
  logoFile?: string;
  createdAt: number;
  updatedAt: number;
}
