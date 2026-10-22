import type { BrandKit, DetailLevel, PromptInput } from './types';

/**
 * 1.3.0 — the user's original, approved logo: the «الثمانية الروبوت» mark chosen in phase 7
 * (brand-src/ibrahi8m-mark.svg, served at /brand/). Every prompt describes it in full (src/aistudio/brandSpec.ts); the files are for «تركيب الشعار» and download.
 */
export const OFFICIAL_LOGO = {
  name: 'IBRAHI8M',
  file: 'ibrahi8m-mark.svg',
  png: 'ibrahi8m-mark-1024.png',
  /** the same artwork without its dark tile, for placing on light or busy images */
  bare: 'ibrahi8m-glyph.svg',
} as const;

/** An option shown in Arabic and written into the prompt in English. */
export interface Opt {
  value: string;
  ar: string;
  en: string;
}

export interface DesignTypeSpec extends Opt {
  /** What a good result of this type needs (English, goes into the prompt). */
  needs: string;
  /** Default ratio for the type. */
  ratio: string;
  /** Typical mistakes of image models for this type (English, goes into the negative prompt). */
  negative: string;
}

/** Design types. Add an entry here to add a type: the form, the library filter and the engine read this list. */
export const DESIGN_TYPES: DesignTypeSpec[] = [
  { value: 'social', ar: 'منشور سوشيال ميديا', en: 'social media post design', needs: 'a bold focal point that reads at thumbnail size, generous safe margins, scroll-stopping contrast', ratio: '4:5', negative: 'cluttered layout, tiny unreadable text' },
  { value: 'poster', ar: 'بوستر أو إعلان', en: 'advertising poster', needs: 'a strong visual hierarchy, one hero element, a clear call-to-action area', ratio: 'A4', negative: 'competing focal points, weak hierarchy' },
  { value: 'cover', ar: 'غلاف كتاب أو مجلة', en: 'book or magazine cover', needs: 'a dedicated title area at the top, room for the spine-safe margin and author line, editorial quality', ratio: 'A4', negative: 'text over busy areas, cropped title area' },
  { value: 'infographic', ar: 'إنفوجرافيك', en: 'infographic layout', needs: 'clearly separated sections, simple flat icons, numbered flow, data-friendly blocks with empty space for real figures', ratio: '9:16', negative: 'fake numbers, invented statistics, illegible micro text' },
  { value: 'educational', ar: 'تصميم تعليمي', en: 'educational illustration for learners', needs: 'clear and accurate visuals, friendly and age-appropriate look, one idea per area, high legibility', ratio: '16:9', negative: 'scientifically inaccurate details, scary imagery, distracting decoration' },
  { value: 'campaign', ar: 'حملة إعلامية أو إنسانية', en: 'media and humanitarian awareness campaign visual', needs: 'dignified and respectful portrayal of people, hopeful emotional tone, clear message area', ratio: '4:5', negative: 'exploitative or graphic suffering, stereotypes, distorted faces' },
  { value: 'identity', ar: 'هوية بصرية', en: 'brand identity board', needs: 'a consistent system of colour swatches, typography samples and pattern elements on a clean board, with empty placeholders where the logo goes', ratio: '16:9', negative: 'invented logos, random brand names, inconsistent palette' },
  { value: 'commercial', ar: 'إعلان تجاري', en: 'commercial advertisement', needs: 'the product or offer as the hero, premium lighting, space for price and call-to-action', ratio: '1:1', negative: 'fake brand names, misleading claims, cheap stock look' },
  { value: 'product', ar: 'تصميم منتج', en: 'product design visualization', needs: 'realistic materials and proportions, studio presentation, clean background showing form and detail', ratio: '1:1', negative: 'impossible geometry, melted shapes, extra parts' },
  { value: 'architecture', ar: 'تصميم معماري أو داخلي', en: 'architectural and interior design visualization', needs: 'correct perspective and scale, realistic materials, natural light behaviour, livable space', ratio: '3:2', negative: 'warped perspective, floating furniture, impossible structures' },
  { value: 'invitation', ar: 'دعوة أو مناسبة', en: 'event invitation card', needs: 'elegant framing, dedicated areas for event name, date and place left clean for real text', ratio: '4:5', negative: 'invented dates or names, cluttered ornaments over text areas' },
  { value: 'thumbnail', ar: 'صورة مصغرة لفيديو', en: 'video thumbnail', needs: 'one large expressive subject, very high contrast, big headline area readable at small size', ratio: '16:9', negative: 'small details lost at thumbnail size, low contrast' },
  { value: 'presentation', ar: 'غلاف عرض تقديمي', en: 'presentation title slide cover', needs: 'a clean title area, professional mood, subtle background graphic that does not fight the text', ratio: '16:9', negative: 'busy background behind the title, clip-art look' },
];

export const RATIOS: (Opt & { size: string })[] = [
  { value: '1:1', ar: 'مربع 1:1', en: 'square 1:1 aspect ratio', size: '1080×1080' },
  { value: '4:5', ar: 'عمودي 4:5', en: 'vertical 4:5 aspect ratio', size: '1080×1350' },
  { value: '9:16', ar: 'طولي 9:16 (ستوري وريلز)', en: 'tall vertical 9:16 aspect ratio', size: '1080×1920' },
  { value: '16:9', ar: 'عريض 16:9', en: 'wide 16:9 aspect ratio', size: '1920×1080' },
  { value: '3:2', ar: 'أفقي 3:2', en: 'landscape 3:2 aspect ratio', size: '1800×1200' },
  { value: 'A4', ar: 'A4 للطباعة', en: 'A4 portrait print format (1:1.414)', size: '210×297 مم' },
];

const o = (value: string, ar: string, en: string): Opt => ({ value, ar, en });

export const STYLES: Opt[] = [
  o('', 'بلا تحديد', ''),
  o('modern-minimal', 'حديث بسيط', 'modern minimalist graphic design'),
  o('flat', 'رسوم مسطحة', 'flat vector illustration'),
  o('3d', 'ثلاثي الأبعاد', 'high quality 3D render'),
  o('photo', 'تصوير واقعي', 'photorealistic professional photography'),
  o('cinematic', 'سينمائي', 'cinematic look, film still quality'),
  o('isometric', 'إيزومتري', 'clean isometric illustration'),
  o('watercolor', 'ألوان مائية', 'soft watercolor illustration'),
  o('arabic-geometric', 'زخرفة هندسية عربية', 'elegant Arabic geometric patterns'),
  o('futuristic', 'مستقبلي تقني', 'futuristic high-tech aesthetic with subtle glow'),
  o('editorial', 'تحريري صحفي', 'editorial magazine design'),
  o('hand-drawn', 'مرسوم باليد', 'hand-drawn sketch style'),
  o('corporate', 'مؤسسي رسمي', 'clean corporate design'),
];

export const LIGHTING: Opt[] = [
  o('', 'بلا تحديد', ''),
  o('soft', 'ناعمة', 'soft diffused lighting'),
  o('studio', 'استوديو', 'professional studio lighting'),
  o('natural', 'طبيعية نهارية', 'natural daylight'),
  o('golden', 'ساعة ذهبية', 'warm golden hour light'),
  o('dramatic', 'درامية', 'dramatic high-contrast lighting'),
  o('neon', 'نيون متوهج', 'neon glow lighting'),
  o('rim', 'إضاءة حواف', 'rim lighting outlining the subject'),
];

export const BACKGROUNDS: Opt[] = [
  o('', 'بلا تحديد', ''),
  o('plain', 'لون واحد نظيف', 'clean solid-colour background'),
  o('gradient', 'تدرج لوني', 'smooth gradient background'),
  o('textured', 'ملمس خفيف', 'subtle textured background'),
  o('blurred', 'مكان حقيقي مموّه', 'softly blurred real environment background'),
  o('pattern', 'نقش هندسي خفيف', 'subtle geometric pattern background'),
  o('dark', 'داكن فاخر', 'dark premium background'),
  o('white', 'أبيض', 'pure white background'),
];

export const ANGLES: Opt[] = [
  o('', 'بلا تحديد', ''),
  o('eye', 'مستوى النظر', 'eye-level view'),
  o('top', 'من الأعلى', "top-down bird's-eye view"),
  o('low', 'من الأسفل', 'low-angle heroic view'),
  o('closeup', 'لقطة قريبة', 'close-up shot'),
  o('wide', 'لقطة واسعة', 'wide establishing shot'),
  o('three-quarter', 'زاوية ثلاثة أرباع', 'three-quarter view'),
];

export const COMPOSITIONS: Opt[] = [
  o('', 'بلا تحديد', ''),
  o('centered', 'العنصر في المنتصف', 'centered symmetrical composition'),
  o('thirds', 'قاعدة الأثلاث', 'rule-of-thirds composition'),
  o('negative', 'مساحة فارغة واسعة', 'generous negative space'),
  o('split', 'مقسوم نصفين', 'split layout composition'),
  o('grid', 'شبكة منظمة', 'organized grid layout'),
  o('diagonal', 'قطري متحرك', 'dynamic diagonal composition'),
];

export const TEXT_PLACEMENTS: Opt[] = [
  o('', 'لا نص على التصميم', ''),
  o('top', 'أعلى التصميم', 'top'),
  o('center', 'في المنتصف', 'center'),
  o('bottom', 'أسفل التصميم', 'bottom'),
  o('right', 'الجانب الأيمن', 'right side'),
  o('left', 'الجانب الأيسر', 'left side'),
];

/** 1.3.0: the logo is mandatory, so there is no «بلا شعار»; «تلقائي» lets the composition decide. */
export const LOGO_PLACEMENTS: Opt[] = [
  o('auto', 'موضع مناسب واضح', 'a suitable, clearly visible position'),
  o('top-right', 'أعلى اليمين', 'top-right corner'),
  o('top-left', 'أعلى اليسار', 'top-left corner'),
  o('bottom-right', 'أسفل اليمين', 'bottom-right corner'),
  o('bottom-left', 'أسفل اليسار', 'bottom-left corner'),
  o('bottom-center', 'أسفل المنتصف', 'bottom center'),
];

export const DETAIL: Record<DetailLevel, Opt> = {
  low: o('low', 'بسيط', 'simple, few details'),
  medium: o('medium', 'متوسط', 'balanced level of detail'),
  high: o('high', 'عالٍ', 'highly detailed, crisp'),
  ultra: o('ultra', 'فائق', 'ultra detailed, sharp focus, 8k quality'),
};

export const PLATFORMS: string[] = ['Instagram', 'Facebook', 'X (Twitter)', 'TikTok', 'YouTube', 'LinkedIn', 'WhatsApp', 'Telegram', 'طباعة', 'موقع إلكتروني', 'عرض تقديمي'];

export const MODE_LABEL = { quick: 'سريع', pro: 'احترافي', brand: 'هوية العلامة' } as const;
export const MODE_HINT = {
  quick: 'برومبت قصير من الفكرة والنوع والأسلوب والمقاس فقط.',
  pro: 'برومبت مفصّل يستخدم كل الإعدادات التي ملأتها.',
  brand: 'مثل الاحترافي، ويضيف قواعد هوية محفوظة (ألوان، خطوط، نبرة، ممنوعات، الشعار).',
} as const;

export const BASE_NEGATIVE = 'low quality, blurry, pixelated, watermark, signature, distorted text, misspelled words, gibberish letters, extra fingers, deformed hands, distorted faces, jpeg artifacts';

/**
 * The two identities kept apart: an educational studio and a personal AI-creative universe.
 * IBRAHIM AI UNIVERSE has no colours fixed here on purpose: they are the owner's to define.
 */
export const BUILTIN_BRANDS: BrandKit[] = [
  {
    id: 'brand-edu-studio',
    name: 'IBRAHI8M EDU STUDIO',
    description: 'هوية الاستوديو التعليمي: أسود وفحمي وفضي معدني وأزرق كهربائي، طابع تقني تعليمي هادئ.',
    colors: 'black #0B0D12, charcoal #1A1E27, metallic silver #C7CDD8, electric blue #2F7BFF',
    fonts: 'clean geometric sans-serif for Latin, modern Naskh/Kufi-style Arabic sans',
    tone: 'professional, educational, trustworthy, modern tech',
    logoRules: '',
    logoFile: 'ibrahi8m-mark.svg',
    rules: 'dark premium base, silver accents, a single electric-blue highlight, generous spacing, right-to-left friendly layout for Arabic text',
    avoid: 'warm neon palettes, playful cartoon chaos, elements of other brands',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'brand-ai-universe',
    name: 'IBRAHIM AI UNIVERSE',
    description: 'هوية منفصلة للمحتوى الإبداعي بالذكاء الاصطناعي. ألوانها وقواعدها يحددها صاحبها: عدّلها قبل الاستخدام.',
    colors: '',
    fonts: '',
    tone: 'creative, visionary, AI-art driven',
    logoRules: '',
    rules: '',
    avoid: 'the IBRAHI8M EDU STUDIO educational identity and its colours, elements of other brands',
    createdAt: 0,
    updatedAt: 0,
  },
];

export const EMPTY_INPUT: PromptInput = {
  idea: '',
  subjectEn: '',
  type: 'social',
  goal: '',
  audience: '',
  platform: '',
  ratio: '4:5',
  style: '',
  colors: '',
  lighting: '',
  background: '',
  angle: '',
  composition: '',
  textPlacement: '',
  logoPlacement: 'bottom-left',
  detail: 'high',
  texts: '',
  required: '',
  avoid: '',
};

/**
 * A small Arabic → English word list for common design ideas. It is a rough aid, not a translator:
 * words it does not know are reported so the user can write the English description themselves.
 */
export const AR_EN: Record<string, string> = {
  طالب: 'student', طلاب: 'students', طالبة: 'female student', طالبات: 'female students', معلم: 'teacher', معلمة: 'female teacher', معلمين: 'teachers', معلمون: 'teachers',
  مدرسة: 'school', مدرسي: 'school', جامعة: 'university', جامعي: 'university', فصل: 'classroom', صف: 'classroom', درس: 'lesson', دروس: 'lessons', تعليم: 'education', تعليمي: 'educational', تعليمية: 'educational',
  تعلم: 'learning', التعلم: 'learning', كتاب: 'book', كتب: 'books', قلم: 'pen', حاسوب: 'computer', كمبيوتر: 'computer', لابتوب: 'laptop', هاتف: 'smartphone', جوال: 'smartphone', شاشة: 'screen', روبوت: 'robot',
  ذكاء: 'intelligence', اصطناعي: 'artificial', الاصطناعي: 'artificial', تقنية: 'technology', تكنولوجيا: 'technology', برمجة: 'coding', إنترنت: 'internet', الإنترنت: 'internet', أمن: 'security', الأمن: 'security', رقمي: 'digital', الرقمي: 'digital', رقمية: 'digital', بيانات: 'data',
  أطفال: 'children', طفل: 'child', طفلة: 'little girl', شباب: 'young people', امرأة: 'woman', رجل: 'man', عائلة: 'family', أم: 'mother', أب: 'father', فريق: 'team', مجتمع: 'community', ناس: 'people',
  غزة: 'Gaza', فلسطين: 'Palestine', فلسطيني: 'Palestinian', مدينة: 'city', قرية: 'village', بحر: 'sea', شاطئ: 'beach', سماء: 'sky', شمس: 'sun', قمر: 'moon', نجوم: 'stars', ليل: 'night', صباح: 'morning', غروب: 'sunset',
  شجرة: 'tree', أشجار: 'trees', زيتون: 'olive', الزيتون: 'olive', زهور: 'flowers', ورد: 'roses', حديقة: 'garden', جبل: 'mountain', صحراء: 'desert', مطر: 'rain', ماء: 'water', طبيعة: 'nature',
  أمل: 'hope', الأمل: 'hope', سلام: 'peace', السلام: 'peace', فرح: 'joy', حب: 'love', قوة: 'strength', نجاح: 'success', مستقبل: 'future', المستقبل: 'future', إبداع: 'creativity', تحدي: 'challenge',
  مساعدات: 'humanitarian aid', إغاثة: 'relief', تبرع: 'donation', خيمة: 'tent', خيام: 'tents', مخيم: 'camp', طعام: 'food', خبز: 'bread', دواء: 'medicine', صحة: 'health', مستشفى: 'hospital', طبيب: 'doctor',
  رمضان: 'Ramadan', عيد: 'Eid', فانوس: 'lantern', هلال: 'crescent', مسجد: 'mosque', قهوة: 'coffee', شاي: 'tea', مطعم: 'restaurant', متجر: 'store', منتج: 'product', عطر: 'perfume', ساعة: 'watch', حذاء: 'shoe', ملابس: 'clothing',
  شعار: 'logo', علامة: 'brand', تجارية: 'commercial', إعلان: 'advertisement', عرض: 'offer', خصم: 'discount', بيت: 'house', منزل: 'house', غرفة: 'room', مكتب: 'office', مطبخ: 'kitchen', صالة: 'living room', أثاث: 'furniture',
  حفل: 'celebration', زفاف: 'wedding', تخرج: 'graduation', مؤتمر: 'conference', ورشة: 'workshop', تدريب: 'training', تدريبية: 'training', دورة: 'course', مهرجان: 'festival', رياضة: 'sports', كرة: 'football',
  ملصق: 'poster', بوستر: 'poster', توعوي: 'awareness', توعية: 'awareness', حملة: 'campaign', حساب: 'account', حسابك: 'your account', حماية: 'protection', خصوصية: 'privacy', قفل: 'lock', كلمة: 'word', مرور: 'password', اختراق: 'hacking', هاكر: 'hacker', درع: 'shield', مختبر: 'laboratory', تجربة: 'experiment', غلاف: 'cover', مجلة: 'magazine', دعوة: 'invitation',
  فيديو: 'video', يوتيوب: 'YouTube', بودكاست: 'podcast', كاميرا: 'camera', تصميم: 'design', تصوير: 'photography', فن: 'art', رسم: 'drawing', ألوان: 'colors', موسيقى: 'music',
  علوم: 'science', العلوم: 'science', رياضيات: 'mathematics', الرياضيات: 'mathematics', فيزياء: 'physics', كيمياء: 'chemistry', أحياء: 'biology', فضاء: 'space', كوكب: 'planet', الأرض: 'Earth', خريطة: 'map', تاريخ: 'history',
  أزرق: 'blue', أحمر: 'red', أخضر: 'green', أصفر: 'yellow', أسود: 'black', أبيض: 'white', ذهبي: 'gold', فضي: 'silver', بنفسجي: 'purple', برتقالي: 'orange', وردي: 'pink', رمادي: 'gray',
  كبير: 'large', صغير: 'small', جميل: 'beautiful', حديث: 'modern', قديم: 'old', تراثي: 'heritage', فاخر: 'luxury', بسيط: 'simple', ملون: 'colorful', مضيء: 'glowing', سعيد: 'happy', حزين: 'sad', يبتسم: 'smiling', يقرأ: 'reading', يكتب: 'writing', يدرس: 'studying', يلعب: 'playing',
};

/** Words skipped when translating (particles and prepositions). */
export const AR_STOP = new Set(['في', 'على', 'من', 'إلى', 'الى', 'عن', 'مع', 'و', 'أو', 'ثم', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'فيه', 'فيها', 'له', 'لها', 'عند', 'بين', 'كل', 'أن', 'ان', 'إن', 'لا', 'يا', 'قد', 'ما', 'هو', 'هي', 'حول', 'تحت', 'فوق', 'أمام', 'خلف', 'داخل', 'خارج', 'عبر', 'بعد', 'قبل', 'نحو', 'لـ', 'بـ', 'تصميم']);
