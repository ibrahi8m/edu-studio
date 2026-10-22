import {
  ANGLES,
  AR_EN,
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
  for (const raw of words) {
    const word = raw.replace(/[.,!?؟،:؛"«»()\-]/g, '');
    if (!word) continue;
    if (!ARABIC.test(word)) {
      out.push(word);
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

/* ───────── 1.3.0: the mandatory brand logo ───────── */

export const LOGO_MARKER = 'MANDATORY BRAND LOGO:';
const LOGO_WORDS = /(شعار|لوغو|لوجو|\blogo\b)/i;

/**
 * The logo instructions that end EVERY prompt, whatever the design type, mode or identity.
 * Wording from the owner's instruction; only the position and the file name are filled in.
 */
export function mandatoryLogo(placement: string, userNotes: string[] = []): string {
  const at = LOGO_PLACEMENTS.find((p) => p.value === placement && p.value !== 'auto');
  const position = at
    ? `Integrate it professionally in the ${at.en} of the composition, a clearly visible position, with sufficient spacing and contrast.`
    : 'Integrate it professionally into a suitable, clearly visible position in the composition, with sufficient spacing and contrast.';
  const notes = userNotes.length
    ? ` Owner's note about the logo (apply it only where it does not alter the original logo artwork): ${userNotes.map((n) => `"${n}"`).join('; ')}.`
    : '';
  return (
    `${LOGO_MARKER} Include the user's original official ${OFFICIAL_LOGO.name} brand logo in the final design. ` +
    'The logo is a required element and must never be omitted. ' +
    `Use the exact original logo asset provided with the project (${OFFICIAL_LOGO.file}). ` +
    'Preserve its original artwork, lettering, colors, proportions, and details without alteration. ' +
    'Do not redraw, regenerate, reinterpret, distort, crop, recolor, or replace the logo. ' +
    `${position} Keep it unobstructed and readable.${notes} ` +
    'If the image generation tool cannot reproduce the logo accurately, reserve a clean space and overlay the original logo asset onto the final image using an image compositing method.'
  );
}

/** Puts the mandatory logo block back if an edited or older saved prompt lost it. Idempotent. */
export function ensureLogo(prompt: string, placement = 'auto'): string {
  if (prompt.includes(LOGO_MARKER)) return prompt;
  return `${prompt.trimEnd()}\n\n${mandatoryLogo(placement)}`;
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
  const logoRules = mandatoryLogo(input.logoPlacement || 'auto', userLogo);

  const parts: string[] = [];
  const article = /^[aeiou]/i.test(type.en) ? 'An' : 'A';
  parts.push(`${article} ${type.en} about ${subject}`);
  if (style?.en) parts.push(style.en);
  parts.push(ratio.en);

  if (mode !== 'quick') {
    const goal = roughTranslate(input.goal).english;
    const audience = roughTranslate(input.audience).english;
    if (goal) parts.push(`purpose: ${goal}`);
    if (audience) parts.push(`designed for ${audience}`);
    if (input.platform) parts.push(`optimized for ${input.platform === 'طباعة' ? 'print' : input.platform === 'موقع إلكتروني' ? 'a website' : input.platform === 'عرض تقديمي' ? 'a presentation' : input.platform}`);
    parts.push(type.needs);
    if (composition?.en) parts.push(composition.en);
    if (angle?.en) parts.push(angle.en);
    if (lighting?.en) parts.push(lighting.en);
    if (background?.en) parts.push(background.en);
    if (colorsEn) parts.push(`color palette: ${colorsEn}`);
    const req = roughTranslate(logoMentions(input.required).rest.join(', ')).english;
    if (req) parts.push(`must include: ${req}`);
    parts.push(detail.en);
  } else if (colorsEn) parts.push(`color palette: ${colorsEn}`);

  if (useBrand) {
    if (useBrand.tone) parts.push(`brand tone: ${useBrand.tone}`);
    if (useBrand.fonts) parts.push(`typography feel: ${useBrand.fonts}`);
    if (useBrand.rules) parts.push(`brand rules: ${useBrand.rules}`);
  }

  if (texts.length) {
    const where = textAt?.en ? ` placed at the ${textAt.en}` : '';
    const quoted = texts.map((t) => `"${t}"`).join(', ');
    const arabicText = texts.some((t) => ARABIC.test(t));
    parts.push(`with the exact text ${quoted}${where}, spelled exactly as written${arabicText ? ', correct right-to-left Arabic letterforms with connected letters' : ''}`);
  } else if (textAt?.en) {
    parts.push(`leave a clean empty area at the ${textAt.en} for text to be added later; no text in the image`);
  } else {
    parts.push('no text in the image');
  }

  // «إعادة التوليد» changes only the order of secondary descriptors and an emphasis phrase.
  const EMPHASIS = ['professional design quality', 'polished and balanced', 'visually striking and clear', 'refined, high-end finish'];
  parts.push(EMPHASIS[Math.abs(variant) % EMPHASIS.length]);
  if (variant) {
    const head = parts.slice(0, 3);
    const rest = parts.slice(3);
    const k = Math.abs(variant) % Math.max(1, rest.length);
    parts.splice(0, parts.length, ...head, ...rest.slice(k), ...rest.slice(0, k));
  }

  const avoidEn = roughTranslate(lines(input.avoid).join(', ')).english;
  const negative = [BASE_NEGATIVE, type.negative, avoidEn, useBrand?.avoid, 'missing logo, altered, redrawn, recolored or distorted logo, invented logos, fake brand names'].filter(Boolean).join(', ');

  // The logo block is part of the prompt text itself (copied, downloaded and saved with it).
  const promptEn = `${parts.map(clean).filter(Boolean).join(', ')}.\n\n${logoRules}`;

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
    `الشعار (إلزامي): أُضيفت إلى نهاية البرومبت نفسه تعليمات شعار ${OFFICIAL_LOGO.name} الأصلي (${OFFICIAL_LOGO.file})${logoAt && logoAt.value !== 'auto' ? ` في ${logoAt.ar}` : ' في موضع مناسب واضح'}، دون إعادة رسم أو تغيير ألوانه ونسبه. هذه التعليمات تُضاف دائمًا ولا يمكن إلغاؤها.${userLogo.length ? ' ودُمجت ملاحظتك عن الشعار فيها بدل تكرارها.' : ideaMentionsLogo ? ' وذكرك للشعار في الفكرة تغطيه هذه التعليمات، فلم يُكرَّر.' : ''}${brand && brand.id !== 'brand-edu-studio' ? ` الهوية المختارة «${brand.name}» تحدد الألوان والقواعد فقط؛ الشعار الإلزامي هو شعار ${OFFICIAL_LOGO.name}.` : ''}`,
  );
  ar.push(
    'تنبيه صريح: النص يطلب الشعار، لكنه وحده لا يضمن ظهوره مطابقًا للأصل؛ أدوات توليد الصور لا ترسم الشعارات بدقة من الوصف. أرفق ملف الشعار الأصلي إن كانت الأداة تقبل صورة مرجعية، وبعد التوليد استخدم «تركيب الشعار» في هذا الاستوديو ليُركَّب الملف الأصلي على صورتك بدقة.',
  );
  ar.push('البرومبت السلبي (Negative prompt) يذكر ما يجب تجنبه، ويُلصق في خانته إن كانت الأداة تدعمها.');
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
