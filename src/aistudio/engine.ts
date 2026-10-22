import {
  ANGLES,
  AR_EN,
  AR_PHRASES,
  AR_PREP,
  AR_STOP,
  BACKGROUNDS,
  BASE_NEGATIVE,
  BUILTIN_BRANDS,
  COMPOSITIONS,
  DESIGN_TYPES,
  DETAIL,
  LIGHTING,
  LOGO_PLACEMENTS,
  OFFICIAL_LOGO,
  RATIOS,
  STYLES,
  TEXT_PLACEMENTS,
  type Opt,
} from './catalog';
import { IBRAHI8M_MARK, IDENTITIES, LOGO_SIZE_BY_TYPE, LOGO_SIZE_DEFAULT, markDescription, wordmarkDescription } from './brandSpec';
import type { BrandKit, PromptInput, PromptMode, PromptOutput } from './types';

/**
 * The local rules engine of the AI Design Studio. Pure functions, no network, no API keys.
 * It assembles a prompt text from the user's choices; it does not create, edit or see any image.
 */

const ARABIC = /[؀-ۿ]/;
const pick = (list: Opt[], value: string) => list.find((x) => x.value === value);
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const lines = (s: string) =>
  s
    .split(/\n|،|,|؛|;/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Strips Arabic prefixes (ال، و، ب، ل، ف، ك) and the feminine/plural endings the word list does not hold. */
function variants(word: string): string[] {
  const w = word.replace(/[ً-ْـ]/g, '');
  const out = [w];
  const strip = (x: string) => {
    for (const p of ['وال', 'بال', 'لل', 'فال', 'كال', 'ال', 'و', 'ب', 'ل', 'ف']) if (x.startsWith(p) && x.length - p.length >= 2) out.push(x.slice(p.length));
  };
  strip(w);
  for (const x of [...out]) {
    if (x.endsWith('ة')) out.push(x.slice(0, -1));
    if (x.endsWith('ات')) out.push(x.slice(0, -2) + 'ة');
  }
  return out;
}

export interface Translation {
  english: string;
  unknown: string[];
  approximate: boolean;
}

/** Word-by-word Arabic → English using the small list in catalog.ts. Latin text passes through unchanged. */
export function roughTranslate(text: string): Translation {
  const t = clean(text);
  if (!t) return { english: '', unknown: [], approximate: false };
  if (!ARABIC.test(t)) return { english: t, unknown: [], approximate: false };
  const words = t.split(/\s+/);
  const out: string[] = [];
  const unknown: string[] = [];
  const bare = (w: string) => w.replace(/[.,!?؟،:؛"«»()\-]/g, '').replace(/[ً-ْـ]/g, '');
  for (let i = 0; i < words.length; i++) {
    const word = bare(words[i]);
    if (!word) continue;
    if (!ARABIC.test(word)) {
      out.push(word);
      continue;
    }
    const pair = i + 1 < words.length ? AR_PHRASES[`${word} ${bare(words[i + 1])}`] : undefined;
    if (pair) {
      out.push(pair);
      i++;
      continue;
    }
    const prep = AR_PREP[word] ?? (word.startsWith('و') ? AR_PREP[word.slice(1)] : undefined);
    if (prep) {
      out.push(prep);
      continue;
    }
    if (AR_STOP.has(word)) continue;
    const hit = variants(word).map((v) => AR_EN[v]).find(Boolean);
    if (hit) {
      if (out[out.length - 1] !== hit) out.push(hit);
    } else unknown.push(word);
  }
  return { english: out.join(' '), unknown: [...new Set(unknown)], approximate: true };
}

export function resolveBrand(brandId: string | null | undefined, saved: BrandKit[]): BrandKit | null {
  if (!brandId) return null;
  return saved.find((b) => b.id === brandId) ?? BUILTIN_BRANDS.find((b) => b.id === brandId) ?? null;
}

const OTHER_IDENTITY: Record<string, RegExp> = {
  'brand-edu-studio': /AI\s*UNIVERSE|يونيفرس/i,
  'brand-ai-universe': /EDU\s*STUDIO|IBRAHI8M\s*EDU|الاستوديو التعليمي/i,
};

/* ───────── 1.3.0 → 1.4.0: the mandatory brand logo, self-contained ───────── */

export const LOGO_MARKER = 'MANDATORY BRAND LOGO:';
export const SPEC_MARKER = 'LOGO SPECIFICATION:';
export const IDENTITY_MARKER = 'BRAND IDENTITY';
export const CORE_MARKER = "CORE IDEA (the user's own words):";
export const AVOID_MARKER = 'CONSTRAINTS — AVOID:';
export const EXECUTE_MARKER = 'EXECUTE IMMEDIATELY:';
/** 1.5.0: the owner's closing instruction, verbatim. It cannot force any platform to generate images. */
export const EXECUTE_LINE =
  "EXECUTE IMMEDIATELY: Generate the final image now, following the user's specified subject, actions, objects, setting, composition, style, and constraints as closely as possible. Do not ask follow-up questions, do not request logo files or additional attachments, and do not provide a text-only description instead of generating the image. Use reasonable judgment only for unspecified, nonessential details. Do not alter the user's core idea.";
/** Words too general to count as a clash between a negative term and the user's idea. */
const NEG_GENERIC = new Set(['extra', 'distorted', 'deformed', 'quality', 'layout', 'text', 'words', 'letters', 'logo', 'logos', 'brand', 'names', 'tiny', 'unreadable', 'low', 'fake', 'invented', 'missing', 'altered', 'redrawn', 'recolored', 'over', 'busy', 'areas', 'with', 'from', 'that', 'other']);
const LOGO_WORDS = /(شعار|لوغو|لوجو|\blogo\b)/i;

export interface LogoContext {
  /** Design type value (size guidance). Unknown or future types get the default size. */
  type?: string;
  /** Identity chosen in the studio; decides the lockup's second line. */
  brandId?: string | null;
}

/** The lockup's second line: «EDU STUDIO» only for the educational identity (or no identity chosen). */
function secondLine(brandId: string | null | undefined): string | null {
  return !brandId || brandId === 'brand-edu-studio' ? 'EDU STUDIO' : null;
}

/**
 * The logo block that ends EVERY prompt, whatever the design type, mode or identity.
 * 1.4.0: it is self-contained — the owner pastes it into ChatGPT, which has no project files —
 * so it describes the logo (from brandSpec.ts) instead of naming a file.
 */
export function mandatoryLogo(placement: string, userNotes: string[] = [], ctx: LogoContext = {}): string {
  const at = LOGO_PLACEMENTS.find((p) => p.value === placement && p.value !== 'auto');
  const position = at
    ? `Integrate it professionally in the ${at.en} of the composition, a clearly visible position.`
    : 'Integrate it professionally into a suitable, clearly visible corner of the composition.';
  const size = (ctx.type && LOGO_SIZE_BY_TYPE[ctx.type]) || LOGO_SIZE_DEFAULT;
  const notes = userNotes.length
    ? ` Owner's note about the logo (apply it only where it does not alter the logo itself): ${userNotes.map((n) => `"${n}"`).join('; ')}.`
    : '';
  return (
    `${LOGO_MARKER} Draw the ${OFFICIAL_LOGO.name} brand logo described below into the design yourself. ` +
    'Everything needed is written in this prompt: do not ask for a logo file, an upload or any confirmation, and do not wait; generate the image directly. ' +
    'The logo is a required element and must never be omitted. ' +
    'Keep its lettering, colors, proportions, and details as described; do not restyle, distort, crop, recolor, or simplify it, and do not add any other logo. ' +
    `${position} Logo size: ${size}. Keep it unobstructed and readable, with sufficient spacing and contrast.${notes}\n` +
    `${SPEC_MARKER} ${markDescription()} ${wordmarkDescription(secondLine(ctx.brandId))}`
  );
}

/** The identity section (colours, type, tone, rules) of the identity chosen in the studio. */
export function identitySection(brand: BrandKit | null): string {
  if (!brand) return '';
  if (brand.id === 'brand-ai-universe') {
    const spec = IDENTITIES['brand-ai-universe'];
    const own = [brand.colors && `colors: ${brand.colors}`, brand.fonts && `typography: ${brand.fonts}`, brand.tone && `tone: ${brand.tone}`, brand.rules && `rules: ${brand.rules}`].filter(Boolean).join('; ');
    return (
      `${IDENTITY_MARKER} — ${spec.name}: this design belongs to ${spec.name}, spelled ${spec.spelling}${own ? `; ${own}` : ''}. ` +
      `This identity has no logo artwork of its own: do not invent an emblem for it. ` +
      'Keep it separate from IBRAHI8M EDU STUDIO: do not write "EDU STUDIO" and do not use the educational studio palette.'
    );
  }
  if (brand.id === 'brand-edu-studio') {
    const c = IBRAHI8M_MARK.colors;
    return (
      `${IDENTITY_MARKER} — ${IDENTITIES['brand-edu-studio'].name}: palette black ${c.tile.hex}, graphite ${c.head.hex}, metallic silver ${c.silverLight.hex} → ${c.silverMid.hex} → ${c.silverDark.hex}, electric blue ${c.blue.hex} and ${c.blueLight.hex}; ` +
      `typography feel: ${brand.fonts}; brand tone: ${brand.tone}; brand rules: ${brand.rules}. ` +
      'Do not mix in elements, names or colors of IBRAHIM AI UNIVERSE or any other brand.'
    );
  }
  const own = [brand.colors && `colors: ${brand.colors}`, brand.fonts && `typography feel: ${brand.fonts}`, brand.tone && `brand tone: ${brand.tone}`, brand.rules && `brand rules: ${brand.rules}`].filter(Boolean).join('; ');
  return `${IDENTITY_MARKER} — ${brand.name}${own ? `: ${own}` : ''}. Keep this identity separate from other brands.`;
}

/**
 * Puts back what an edited or older saved prompt lost: the mandatory logo block (1.3.0) and the
 * EXECUTE IMMEDIATELY line (1.5.0), each exactly once. Blocks from 1.3.0/1.4.0, which named a file or
 * offered to place «the official logo afterwards», are replaced by the current one. Idempotent.
 */
export function ensureLogo(prompt: string, placement = 'auto', ctx: LogoContext = {}): string {
  let p = prompt;
  const old = p.includes(LOGO_MARKER) && (!p.includes(SPEC_MARKER) || /No logo file is attached|placed over it afterwards|provided with the project/.test(p));
  if (old) {
    const start = p.indexOf(LOGO_MARKER);
    const tail = p.slice(start);
    const end = [AVOID_MARKER, EXECUTE_MARKER].map((m) => tail.indexOf(m)).filter((i) => i > 0);
    p = `${p.slice(0, start).trimEnd()}\n\n${mandatoryLogo(placement, [], ctx)}${end.length ? `\n\n${tail.slice(Math.min(...end))}` : ''}`;
  }
  if (!p.includes(LOGO_MARKER)) {
    const at = [AVOID_MARKER, EXECUTE_MARKER].map((m) => p.indexOf(m)).filter((i) => i >= 0);
    const block = mandatoryLogo(placement, [], ctx);
    p = at.length ? `${p.slice(0, Math.min(...at)).trimEnd()}\n\n${block}\n\n${p.slice(Math.min(...at))}` : `${p.trimEnd()}\n\n${block}`;
  }
  if (!p.includes(EXECUTE_MARKER)) p = `${p.trimEnd()}\n\n${EXECUTE_LINE}`;
  else if (!p.trimEnd().endsWith(EXECUTE_LINE.slice(-40))) {
    // the user typed after the execute line: move the line back to the end
    p = `${p.replace(EXECUTE_LINE, '').replace(/\n{3,}/g, '\n\n').trimEnd()}\n\n${EXECUTE_LINE}`;
  }
  return p;
}

/** Splits the owner's own mentions of the logo out of free text (to merge, not repeat, them). */
function logoMentions(...fields: string[]): { notes: string[]; rest: string[] } {
  const notes: string[] = [];
  const rest: string[] = [];
  for (const f of fields)
    for (const part of f.split(/\n|،|,|؛|;/).map((x) => x.trim()).filter(Boolean)) (LOGO_WORDS.test(part) ? notes : rest).push(part);
  return { notes, rest };
}

/** Builds the prompt and its Arabic explanation. Same input → same output (no randomness unless `variant` changes). */
export function buildPrompt(input: PromptInput, mode: PromptMode, brand: BrandKit | null, variant = 0): PromptOutput {
  const warnings: string[] = [];
  const type = DESIGN_TYPES.find((t) => t.value === input.type) ?? DESIGN_TYPES[0];
  const ratio = RATIOS.find((r) => r.value === input.ratio) ?? RATIOS.find((r) => r.value === type.ratio)!;
  const style = pick(STYLES, input.style);
  const lighting = pick(LIGHTING, input.lighting);
  const background = pick(BACKGROUNDS, input.background);
  const angle = pick(ANGLES, input.angle);
  const composition = pick(COMPOSITIONS, input.composition);
  const textAt = pick(TEXT_PLACEMENTS, input.textPlacement);
  const logoAt = pick(LOGO_PLACEMENTS, input.logoPlacement);
  const detail = DETAIL[input.detail] ?? DETAIL.high;

  // Subject in English: the user's own English wins; otherwise a rough word list translation.
  let subject = clean(input.subjectEn);
  if (!subject) {
    const tr = roughTranslate(input.idea);
    subject = tr.english;
    if (tr.approximate)
      warnings.push(
        tr.unknown.length
          ? `الترجمة إلى الإنجليزية تقريبية (قاموس محلي صغير). كلمات لم تُترجم: ${tr.unknown.slice(0, 12).join('، ')}. اكتب وصف الفكرة بالإنجليزية في الحقل المخصص لنتيجة أدق.`
          : 'الترجمة إلى الإنجليزية تقريبية (قاموس محلي صغير). راجعها، أو اكتب وصف الفكرة بالإنجليزية في الحقل المخصص.',
      );
  }
  // The logo is handled by the mandatory block below: drop it from the subject so it is not asked twice.
  subject = clean(subject.replace(/\b(?:(?:with|and|plus)\s+)?(?:the\s+|my\s+|our\s+|a\s+)?(?:brand\s+)?logo\b/gi, ''));
  if (!subject) {
    subject = 'a clear central subject';
    warnings.push('لم تُكتب فكرة التصميم: البرومبت عام. اكتب الفكرة لنتيجة أفضل.');
  }

  const useBrand = mode === 'brand' && brand ? brand : null;
  if (mode === 'brand' && !brand) warnings.push('وضع «هوية العلامة» يحتاج اختيار هوية محفوظة؛ استُخدم الوضع الاحترافي.');
  if (useBrand && !useBrand.colors.trim()) warnings.push(`هوية «${useBrand.name}» بلا ألوان محددة بعد. عدّلها من «الهويات» لتُضاف ألوانها إلى البرومبت.`);
  // The identity chosen for the logo (every mode) is kept apart from the other one.
  if (brand) {
    const clash = OTHER_IDENTITY[brand.id];
    const all = [input.idea, input.subjectEn, input.texts, input.required, input.colors].join(' ');
    if (clash && clash.test(all)) warnings.push(`نصك يذكر هوية أخرى غير «${brand.name}». الهويتان منفصلتان: لا تجمع بينهما في تصميم واحد.`);
  }

  const texts = lines(input.texts).slice(0, 6);
  const colors = clean([useBrand?.colors, input.colors].filter(Boolean).join(', '));
  const colorsEn = colors ? roughTranslate(colors).english || colors : '';

  // Logo (1.3.0): mandatory in every prompt, always the owner's original IBRAHI8M logo. The owner's own
  // logo remarks (in the idea or «عناصر مطلوبة») are merged into the block instead of being repeated.
  // Remarks written in «عناصر مطلوبة» are kept as the owner's note; a mention in the idea itself is simply
  // covered by the block (removed from the subject above).
  const userLogo = logoMentions(input.required).notes;
  const ideaMentionsLogo = LOGO_WORDS.test(`${input.idea} ${input.subjectEn}`);
  const logoRules = mandatoryLogo(input.logoPlacement || 'auto', userLogo, { type: input.type, brandId: brand?.id ?? null });

  // 1.5.0: the prompt is built as labelled sections so nothing the user asked for is lost or reworded,
  // and it ends with the owner's EXECUTE IMMEDIATELY instruction.
  const idea = clean(input.idea);
  const article = /^[aeiou]/i.test(type.en) ? 'An' : 'A';
  const main = [`${article} ${type.en} about ${subject}`, style?.en, ratio.en].filter(Boolean).join(', ');
  const sections: string[] = [];
  if (idea && (ARABIC.test(idea) || clean(input.subjectEn))) sections.push(`${CORE_MARKER} «${idea}». Keep every person (and their number), action, object and place of this idea exactly as written; do not replace, reinterpret or drop any of them.`);
  sections.push(`${main}.`);

  const emphasis = ['professional design quality', 'polished and balanced', 'visually striking and clear', 'refined, high-end finish'][Math.abs(variant) % 4];
  const req = roughTranslate(logoMentions(input.required).rest.join(', ')).english;
  if (mode !== 'quick') {
    const goal = roughTranslate(input.goal).english;
    const audience = roughTranslate(input.audience).english;
    if (req) sections.push(`MUST INCLUDE: ${req}.`);
    if (background?.en) sections.push(`SETTING & BACKGROUND: ${background.en}.`);
    const comp = [composition?.en, angle?.en, type.needs].filter(Boolean) as string[];
    // «إعادة التوليد» only reorders secondary descriptors and changes the emphasis phrase.
    const k = Math.abs(variant) % Math.max(1, comp.length);
    sections.push(`COMPOSITION: ${[...comp.slice(k), ...comp.slice(0, k)].join(', ')}.`);
    const look = [lighting?.en, colorsEn && `color palette: ${colorsEn}`].filter(Boolean);
    if (look.length) sections.push(`LIGHT & COLOR: ${look.join(', ')}.`);
    const fmt = [ratio.en, detail.en, emphasis, goal && `purpose: ${goal}`, audience && `designed for ${audience}`, input.platform && `optimized for ${input.platform === 'طباعة' ? 'print' : input.platform === 'موقع إلكتروني' ? 'a website' : input.platform === 'عرض تقديمي' ? 'a presentation' : input.platform}`].filter(Boolean);
    sections.push(`FORMAT & QUALITY: ${fmt.join(', ')}.`);
  } else {
    if (colorsEn) sections.push(`LIGHT & COLOR: color palette: ${colorsEn}.`);
    sections.push(`FORMAT & QUALITY: ${ratio.en}, ${emphasis}.`);
  }

  // Text: either the exact texts, or none at all — the lettering inside the official logo is the only exception.
  if (texts.length) {
    const where = textAt?.en ? ` placed at the ${textAt.en}` : '';
    const quoted = texts.map((t) => `"${t}"`).join(', ');
    const arabicText = texts.some((t) => ARABIC.test(t));
    sections.push(`TEXT IN THE IMAGE: only the exact text ${quoted}${where}, spelled exactly as written${arabicText ? ', correct right-to-left Arabic letterforms with connected letters' : ''}; no other added text (the name inside the logo is part of the logo).`);
  } else if (textAt?.en) {
    sections.push(`TEXT IN THE IMAGE: leave a clean empty area at the ${textAt.en} for text to be added later; no text in the image apart from the name inside the logo.`);
  } else {
    sections.push('TEXT IN THE IMAGE: no text in the image — no captions, words or letters anywhere, except the name that is part of the logo itself.');
  }

  // Negative terms that contradict what the user asked for are dropped, not sent.
  const avoidEn = roughTranslate(lines(input.avoid).join(', ')).english;
  const wanted = `${subject} ${req} ${texts.join(' ')}`.toLowerCase();
  const dropped: string[] = [];
  const negTerms = [BASE_NEGATIVE, type.negative, avoidEn, useBrand?.avoid, 'missing logo, altered, redrawn, recolored or distorted logo, invented logos, fake brand names']
    .filter(Boolean)
    .join(', ')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => {
      const words = t.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !NEG_GENERIC.has(w));
      const clash = words.some((w) => new RegExp(`\\b${w.replace(/[^a-z]/g, '')}`).test(wanted));
      if (clash) dropped.push(t);
      return !clash;
    });
  const negative = [...new Set(negTerms)].join(', ');
  if (dropped.length) warnings.push(`حُذف من قائمة «تجنّب» ما يتعارض مع فكرتك أو عناصرك المطلوبة: ${dropped.join('، ')}.`);

  // The logo block is part of the prompt text itself (copied, downloaded and saved with it).
  const identity = identitySection(brand);
  const promptEn = [...sections, identity, logoRules, `${AVOID_MARKER} ${negative}.`, EXECUTE_LINE].filter(Boolean).join('\n\n');

  const ar: string[] = [];
  ar.push(`يطلب هذا البرومبت ${type.ar} عن فكرتك${input.idea.trim() ? ` «${clean(input.idea)}»` : ''}، بمقاس ${ratio.ar} (${ratio.size}).`);
  if (style?.ar && style.value) ar.push(`الأسلوب: ${style.ar}.`);
  if (mode !== 'quick') {
    const bits = [composition?.value && `التكوين: ${composition.ar}`, angle?.value && `الزاوية: ${angle.ar}`, lighting?.value && `الإضاءة: ${lighting.ar}`, background?.value && `الخلفية: ${background.ar}`, `مستوى التفاصيل: ${detail.ar}`].filter(Boolean);
    ar.push(`${bits.join('، ')}.`);
    ar.push(`ويطلب ما يحتاجه هذا النوع عادةً: ${typeNeedsAr(type.value)}.`);
  }
  if (colors) ar.push(`الألوان: ${colors}.`);
  if (useBrand) ar.push(`طُبّقت قواعد هوية «${useBrand.name}» المحفوظة (النبرة والخطوط والقواعد والممنوعات).`);
  ar.push(texts.length ? `النصوص المطلوبة على التصميم كُتبت بين علامتي تنصيص كما هي، مع طلب كتابتها حرفيًا${textAt?.value ? ` في ${textAt.ar}` : ''}. أدوات توليد الصور قد تخطئ في الحروف العربية: راجع النص في الصورة الناتجة، أو أضفه لاحقًا ببرنامج تصميم.` : textAt?.value ? `طُلبت مساحة فارغة في ${textAt.ar} لتضيف النص لاحقًا.` : 'طُلب تصميم بلا نص.');
  ar.push(
    `الشعار (إلزامي): أُضيفت إلى نهاية البرومبت نفسه تعليمات شعار ${OFFICIAL_LOGO.name} الأصلي${logoAt && logoAt.value !== 'auto' ? ` في ${logoAt.ar}` : ' في موضع مناسب واضح'}، مع حجم مناسب لنوع التصميم، ومعها «مواصفات الشعار» كاملة بالإنجليزية: الرمز (الرقم 8 من حلقتين: رأس روبوت بعينين مضيئتين فوق حلقة دائرة كهربائية)، والاسم وطريقة كتابته، والألوان بأكوادها، والنِّسب. البرومبت مكتفٍ بذاته: لا يحتاج رفع ملف ولا يذكر مسارًا، فيُلصق في ChatGPT كما هو. هذه التعليمات تُضاف دائمًا ولا يمكن إلغاؤها.${userLogo.length ? ' ودُمجت ملاحظتك عن الشعار فيها بدل تكرارها.' : ideaMentionsLogo ? ' وذكرك للشعار في الفكرة تغطيه هذه التعليمات، فلم يُكرَّر.' : ''}`,
  );
  if (brand) ar.push(brand.id === 'brand-ai-universe' ? `الهوية: قسم «BRAND IDENTITY» يحدد هوية «${brand.name}» واسمها، ويمنع خلطها بهوية الاستوديو التعليمي. لا يوجد في المشروع شعار خاص بها، فلم يُخترع لها شعار، والشعار الإلزامي هو شعار ${OFFICIAL_LOGO.name} دون سطر «EDU STUDIO».` : `الهوية: قسم «BRAND IDENTITY» يضيف ألوان «${brand.name}» بأكوادها ونبرتها وقواعدها، ويمنع خلطها بهوية أخرى.`);
  ar.push(
    'تنبيه صريح: الوصف المفصّل يقرّب النتيجة، لكنه لا يضمن أن ترسم أداة التوليد شعارًا معقّدًا مطابقًا للأصل حرفيًا. للتطابق التام استخدم «تركيب الشعار» في هذا الاستوديو بعد التوليد، فيُركَّب الملف الأصلي على صورتك.',
  );
  if (idea && ARABIC.test(idea)) ar.push('فكرتك كُتبت في أول البرومبت بنصها العربي كما هي («CORE IDEA»)، وطُلب الحفاظ على كل شخص وفعل ومكان وعنصر فيها؛ فالترجمة التقريبية لا تغيّر المعنى.');
  ar.push('في نهاية البرومبت أمر «EXECUTE IMMEDIATELY» يطلب توليد الصورة مباشرة دون أسئلة ودون طلب ملف الشعار. هذا يساعد، لكنه لا يُجبر أي منصة على التوليد إن كانت قيودها تمنع ذلك.');
  ar.push('البرومبت السلبي (Negative prompt) يذكر ما يجب تجنبه، وهو مكتوب أيضًا داخل البرومبت تحت «CONSTRAINTS — AVOID» لأن ChatGPT لا يملك خانة منفصلة له.');
  ar.push('هذا نص يُنسخ إلى أداة توليد صور خارجية تختارها أنت؛ التطبيق لا يولّد صورًا ولا يتصل بأي خدمة.');

  return {
    promptEn,
    explanationAr: ar.join('\n'),
    typeLabel: type.ar,
    colors,
    ratio: `${ratio.ar} — ${ratio.size}`,
    texts,
    negative,
    logoRules,
    warnings,
  };
}

function typeNeedsAr(type: string): string {
  const m: Record<string, string> = {
    social: 'عنصر رئيسي واضح يُقرأ في الحجم الصغير، وهوامش آمنة، وتباين قوي',
    poster: 'تسلسل بصري قوي، وعنصر بطل واحد، ومساحة لدعوة الإجراء',
    cover: 'مساحة للعنوان في الأعلى، وهوامش آمنة، وجودة تحريرية',
    infographic: 'أقسام منفصلة، وأيقونات بسيطة، وتسلسل مرقّم، ومساحات فارغة للأرقام الحقيقية (لا أرقام مختلقة)',
    educational: 'دقة علمية، ومظهر ودود مناسب للعمر، وفكرة واحدة في كل جزء',
    campaign: 'تصوير يحفظ كرامة الناس، ونبرة أمل، ومساحة للرسالة',
    identity: 'نظام متسق من الألوان والخطوط والعناصر، مع أماكن فارغة للشعار',
    commercial: 'المنتج أو العرض بطلًا، وإضاءة فاخرة، ومساحة للسعر ودعوة الإجراء',
    product: 'خامات ونِسب واقعية، وعرض استوديو، وخلفية نظيفة',
    architecture: 'منظور ومقياس صحيحان، وخامات واقعية، وإضاءة طبيعية',
    invitation: 'إطار أنيق، ومساحات نظيفة لاسم المناسبة وموعدها ومكانها',
    thumbnail: 'عنصر كبير معبّر، وتباين عالٍ جدًا، ومساحة لعنوان كبير',
    presentation: 'مساحة نظيفة للعنوان، وطابع احترافي، وخلفية هادئة لا تنافس النص',
  };
  return m[type] ?? 'وضوح العنصر الرئيسي وجودة الإخراج';
}

/** The full text of a prompt card, for copying or saving as .txt. */
export function promptAsText(title: string, out: PromptOutput, prompt: string): string {
  return [
    `IBRAHI8M AI Design Studio — ${title}`,
    '',
    'PROMPT (EN):',
    prompt,
    '',
    'NEGATIVE PROMPT:',
    out.negative,
    '',
    'LOGO:',
    out.logoRules,
    '',
    `النوع: ${out.typeLabel}`,
    `المقاس: ${out.ratio}`,
    out.colors ? `الألوان: ${out.colors}` : '',
    out.texts.length ? `النصوص: ${out.texts.join(' | ')}` : '',
    '',
    'الشرح:',
    out.explanationAr,
    '',
    'ملاحظة: هذا نص برومبت فقط. لم يُولَّد أي تصميم أو صورة داخل التطبيق.',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n');
}
