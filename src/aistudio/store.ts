import type { EduDB } from '../db/db';
import { newId } from '../db/ids';
import { BUILTIN_BRANDS, EMPTY_INPUT, LOGO_PLACEMENTS } from './catalog';
import { ensureLogo } from './engine';
import type { BrandKit, PromptInput, PromptMode, PromptOutput, SavedPrompt } from './types';

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');

export function normalizeInput(raw: unknown): PromptInput {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...EMPTY_INPUT };
  for (const k of Object.keys(EMPTY_INPUT) as (keyof PromptInput)[]) {
    if (typeof r[k] === 'string') (out as Record<string, string>)[k] = str(r[k], k === 'idea' || k === 'subjectEn' ? 3000 : 1500);
  }
  if (!['low', 'medium', 'high', 'ultra'].includes(out.detail)) out.detail = 'high';
  // 1.3.0: the logo can no longer be switched off; old «بلا شعار» becomes «موضع مناسب».
  if (!LOGO_PLACEMENTS.some((p) => p.value === out.logoPlacement)) out.logoPlacement = 'auto';
  return out;
}

export function normalizeSavedPrompt(raw: unknown): SavedPrompt | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SavedPrompt>;
  if (typeof r.id !== 'string' || !r.output || typeof r.output !== 'object') return null;
  const o = r.output as Partial<PromptOutput>;
  return {
    id: r.id,
    title: str(r.title, 160) || 'برومبت بلا عنوان',
    type: str(r.type, 40),
    mode: r.mode === 'quick' || r.mode === 'brand' ? r.mode : 'pro',
    brandId: typeof r.brandId === 'string' ? r.brandId : null,
    input: normalizeInput(r.input),
    output: {
      promptEn: str(o.promptEn, 12000),
      explanationAr: str(o.explanationAr, 12000),
      typeLabel: str(o.typeLabel, 120),
      colors: str(o.colors, 1000),
      ratio: str(o.ratio, 120),
      texts: Array.isArray(o.texts) ? o.texts.filter((x): x is string => typeof x === 'string').slice(0, 10) : [],
      negative: str(o.negative, 4000),
      logoRules: str(o.logoRules, 2000),
      warnings: Array.isArray(o.warnings) ? o.warnings.filter((x): x is string => typeof x === 'string').slice(0, 10) : [],
    },
    editedPrompt: str(r.editedPrompt, 12000),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
  };
}

export async function savePrompt(
  database: EduDB,
  p: { id?: string; title: string; mode: PromptMode; brandId: string | null; input: PromptInput; output: PromptOutput; editedPrompt?: string },
): Promise<SavedPrompt> {
  const now = Date.now();
  const cur = p.id ? await database.prompts.get(p.id) : undefined;
  const row: SavedPrompt = {
    id: cur?.id ?? newId(),
    title: p.title.trim().slice(0, 160) || 'برومبت بلا عنوان',
    type: p.input.type,
    mode: p.mode,
    brandId: p.brandId,
    input: p.input,
    output: p.output,
    editedPrompt: (p.editedPrompt ?? '').slice(0, 12000),
    createdAt: cur?.createdAt ?? now,
    updatedAt: now,
  };
  await database.prompts.put(row);
  return row;
}

export async function duplicatePrompt(database: EduDB, id: string): Promise<SavedPrompt> {
  const cur = await database.prompts.get(id);
  if (!cur) throw new Error('البرومبت غير موجود.');
  const now = Date.now();
  // a copy of a prompt saved before 1.3.0 gets the mandatory logo block too
  const text = cur.editedPrompt || cur.output.promptEn;
  const withLogo = ensureLogo(text, cur.input.logoPlacement);
  const copy = { ...cur, id: newId(), title: `${cur.title} (نسخة)`.slice(0, 160), editedPrompt: withLogo !== cur.output.promptEn ? withLogo : cur.editedPrompt, createdAt: now, updatedAt: now };
  await database.prompts.add(copy);
  return copy;
}

export async function deletePrompt(database: EduDB, id: string): Promise<SavedPrompt | null> {
  const cur = (await database.prompts.get(id)) ?? null;
  await database.prompts.delete(id);
  return cur;
}

/** Built-in identities merged with the user's saved edits and own identities. */
export async function listBrands(database: EduDB): Promise<BrandKit[]> {
  const saved = await database.brands.toArray();
  const ids = new Set(saved.map((b) => b.id));
  return [...BUILTIN_BRANDS.filter((b) => !ids.has(b.id)), ...saved].sort((a, b) => {
    const ai = BUILTIN_BRANDS.findIndex((x) => x.id === a.id);
    const bi = BUILTIN_BRANDS.findIndex((x) => x.id === b.id);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.name.localeCompare(b.name);
  });
}

export function normalizeBrand(raw: unknown): BrandKit | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<BrandKit>;
  if (typeof r.id !== 'string' || !str(r.name, 120).trim()) return null;
  return {
    id: r.id,
    name: str(r.name, 120).trim(),
    description: str(r.description, 1000),
    colors: str(r.colors, 600),
    fonts: str(r.fonts, 400),
    tone: str(r.tone, 400),
    logoRules: str(r.logoRules, 1000),
    rules: str(r.rules, 2000),
    avoid: str(r.avoid, 1000),
    ...(typeof r.logoFile === 'string' && /^[\w.-]{1,80}$/.test(r.logoFile) ? { logoFile: r.logoFile } : {}),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
  };
}

export async function saveBrand(database: EduDB, b: Omit<BrandKit, 'createdAt' | 'updatedAt' | 'id'> & { id?: string }): Promise<BrandKit> {
  if (!b.name.trim()) throw new Error('اكتب اسم الهوية.');
  const now = Date.now();
  const cur = b.id ? await database.brands.get(b.id) : undefined;
  const row = normalizeBrand({ ...b, id: b.id ?? newId(), createdAt: cur?.createdAt ?? now, updatedAt: now })!;
  await database.brands.put(row);
  return row;
}

/** Deleting a built-in identity only removes the user's edits (the original comes back). */
export async function deleteBrand(database: EduDB, id: string): Promise<void> {
  await database.brands.delete(id);
}
