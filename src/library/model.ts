import { newId } from '../db/ids';
import { normalizeArabic } from '../db/search';
import { emptyDoc, newBlock, newObjective, normalizeDoc } from '../lesson/model';
import type { ActivityBlock, Block, CardsBlock, HeadingBlock, LessonDoc, SummaryBlock, TextBlock } from '../lesson/types';
import { normalizeDesign } from '../studio/model';
import type { LibraryItem, LibraryKind } from './types';

export const KIND_LABEL: Record<LibraryKind, string> = {
  lesson: 'قالب درس',
  block: 'عنصر تعليمي',
  design: 'قالب تصميم',
  media: 'وسائط',
};

export const LIMITS = { title: 120, description: 600, tags: 12, tag: 40 };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export function cleanLibraryTags(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,،\n]/) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const t = raw.replace(/^#/, '').trim().slice(0, LIMITS.tag);
    const k = normalizeArabic(t);
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= LIMITS.tags) break;
  }
  return out;
}

/** Blocks stored in the library: cleaned through the lesson model (unknown types dropped). */
export function normalizeBlocks(v: unknown): Block[] {
  const doc = normalizeDoc({ lessonId: 'x', blocks: Array.isArray(v) ? v : [] }, 'x');
  return doc.blocks.map((b) => ({ ...b, objectiveIds: [] }));
}

export function normalizeLibraryItem(raw: unknown): LibraryItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const base = {
    id: r.id,
    title: str(r.title, LIMITS.title),
    description: str(r.description, LIMITS.description),
    tags: cleanLibraryTags(r.tags),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
  };
  const d = (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown>;
  switch (r.kind) {
    case 'lesson':
      return { ...base, kind: 'lesson', data: { summary: str(d.summary, 600), duration: typeof d.duration === 'number' && d.duration >= 0 ? Math.min(600, Math.round(d.duration)) : 0, doc: normalizeDoc(d.doc, 'template') } };
    case 'block': {
      const blocks = normalizeBlocks(d.blocks);
      return blocks.length ? { ...base, kind: 'block', data: { blocks } } : null;
    }
    case 'design': {
      const des = normalizeDesign({ id: 'x', projectId: 'x', kind: d.kind, theme: d.theme, data: d.data, title: base.title });
      return des ? { ...base, kind: 'design', data: { kind: des.kind, theme: des.theme, data: des.data } } : null;
    }
    case 'media':
      return typeof d.assetId === 'string' && d.assetId ? { ...base, kind: 'media', data: { assetId: d.assetId } } : null;
    default:
      return null;
  }
}

/** Asset ids a library item depends on (to copy them along). */
export function itemAssetIds(item: LibraryItem): string[] {
  if (item.kind === 'media') return [item.data.assetId];
  const blocks = item.kind === 'lesson' ? item.data.doc.blocks : item.kind === 'block' ? item.data.blocks : [];
  return blocks.flatMap((b) => ('assetId' in b && b.assetId ? [b.assetId] : []));
}

/* ───────── built-in items: shipped with the app, read-only, always offline ───────── */

const heading = (text: string, level: 2 | 3 = 2): HeadingBlock => ({ ...(newBlock('heading') as HeadingBlock), text, level });
const text = (t: string): TextBlock => ({ ...(newBlock('text') as TextBlock), text: t });
const activity = (title: string, steps: string[], grouping: ActivityBlock['grouping'], duration: number, output = '', materials = ''): ActivityBlock => ({
  ...(newBlock('activity') as ActivityBlock),
  title,
  steps: steps.join('\n'),
  grouping,
  duration,
  output,
  materials,
});
const summary = (title: string, style: SummaryBlock['style'], points: [string, string][]): SummaryBlock => ({
  ...(newBlock('summary') as SummaryBlock),
  title,
  style,
  points: points.map(([t, x]) => ({ id: newId(), title: t, text: x })),
});
const cards = (title: string, list: [string, string][]): CardsBlock => ({ ...(newBlock('cards') as CardsBlock), title, cards: list.map(([front, back]) => ({ id: newId(), front, back })) });

function lessonDoc(strategies: string[], assessmentTypes: string[], assessmentTools: string[], blocks: Block[], notes: string): LessonDoc {
  const doc = emptyDoc('template');
  doc.objectives = [newObjective({ level: 2, verb: 'يشرح', content: '…' }), newObjective({ level: 3, verb: 'يطبّق', content: '…' })];
  doc.strategies = strategies;
  doc.assessmentTypes = assessmentTypes;
  doc.assessmentTools = assessmentTools;
  doc.strategyNotes = notes;
  doc.blocks = blocks;
  return doc;
}

const T0 = Date.UTC(2026, 9, 20);

/** Ids start with "builtin:" so they can never collide with the teacher's own items. */
export function builtinItems(): LibraryItem[] {
  return [
    {
      id: 'builtin:lesson-discovery',
      kind: 'lesson',
      title: 'درس بالتعلم بالاكتشاف',
      description: 'تمهيد بسؤال مثير، ثم نشاط استكشاف في مجموعات، ثم مناقشة واستنتاج، فملخص وبطاقة خروج.',
      tags: ['التعلم بالاكتشاف', 'مجموعات', 'قالب جاهز'],
      createdAt: T0,
      updatedAt: T0,
      data: {
        summary: 'يكتشف الطلاب المفهوم بأنفسهم من خلال نشاط موجّه.',
        duration: 45,
        doc: lessonDoc(
          ['discovery'],
          ['formative'],
          ['exit'],
          [
            heading('التمهيد'),
            text('سؤال مثير للتفكير يربط الدرس بحياة الطلاب: …'),
            heading('الاستكشاف'),
            activity('نشاط الاكتشاف', ['اقرأ الموقف أو لاحظ الصورة', 'سجّل ملاحظاتك في جدول', 'ناقش مجموعتك في النمط الذي لاحظتموه'], 'groups', 15, 'جدول ملاحظات المجموعة'),
            heading('الاستنتاج'),
            text('ما القاعدة أو المفهوم الذي توصلتم إليه؟ …'),
            summary('خلاصة الدرس', 'steps', [
              ['لاحظنا', '…'],
              ['استنتجنا', '…'],
              ['طبّقنا', '…'],
            ]),
          ],
          'الاكتشاف الموجّه يرفع دافعية الطلاب ويثبّت الفهم لأنهم يبنون المفهوم بأنفسهم.',
        ),
      },
    },
    {
      id: 'builtin:lesson-flipped',
      kind: 'lesson',
      title: 'درس بالتعلم المقلوب',
      description: 'مشاهدة أو قراءة قبل الحصة، ثم وقت الحصة للتطبيق والنقاش، مع تقويم تكويني سريع.',
      tags: ['التعلم المقلوب', 'تطبيق', 'قالب جاهز'],
      createdAt: T0,
      updatedAt: T0,
      data: {
        summary: 'يتعلم الطالب المحتوى في البيت، ويطبّقه في الصف.',
        duration: 45,
        doc: lessonDoc(
          ['flipped'],
          ['formative'],
          ['quiz'],
          [
            heading('قبل الحصة'),
            text('شاهد المقطع أو اقرأ النص، ثم دوّن سؤالين: …'),
            heading('في الحصة'),
            activity('تطبيق في أزواج', ['راجعا سؤاليكما معًا', 'حُلّا التمرين المطلوب', 'اعرضا الحل على مجموعة أخرى'], 'pairs', 20, 'حل التمرين مع التبرير'),
            cards('بطاقات المراجعة', [
              ['مفهوم 1', 'تعريفه …'],
              ['مفهوم 2', 'تعريفه …'],
            ]),
          ],
          'يوفّر وقت الحصة للتطبيق والتغذية الراجعة الفورية بدل الإلقاء.',
        ),
      },
    },
    {
      id: 'builtin:lesson-cooperative',
      kind: 'lesson',
      title: 'درس بالتعلم التعاوني (جيكسو)',
      description: 'كل عضو خبير في جزء، ثم تعليم الأقران، ثم اختبار قصير فردي.',
      tags: ['التعلم التعاوني', 'جيكسو', 'قالب جاهز'],
      createdAt: T0,
      updatedAt: T0,
      data: {
        summary: 'يتقاسم الطلاب أجزاء الدرس ويعلّم كل منهم الآخرين.',
        duration: 50,
        doc: lessonDoc(
          ['cooperative'],
          ['formative'],
          ['rubric'],
          [
            heading('مجموعات الخبراء'),
            activity('جيكسو', ['وزّع الأجزاء على أعضاء المجموعة', 'اجتمع بخبراء جزئك من المجموعات الأخرى', 'عد إلى مجموعتك وعلّمهم جزءك'], 'groups', 25, 'ملخص كل جزء بكلمات المجموعة'),
            summary('ما تعلمناه', 'grid', [
              ['الجزء الأول', '…'],
              ['الجزء الثاني', '…'],
              ['الجزء الثالث', '…'],
            ]),
          ],
          'يعزز المسؤولية الفردية والاعتماد المتبادل الإيجابي.',
        ),
      },
    },
    {
      id: 'builtin:block-tps',
      kind: 'block',
      title: 'نشاط فكّر — زاوج — شارك',
      description: 'نشاط قصير للنقاش المنظم: تفكير فردي ثم ثنائي ثم مشاركة مع الصف.',
      tags: ['نشاط', 'نقاش', 'قالب جاهز'],
      createdAt: T0,
      updatedAt: T0,
      data: { blocks: [activity('فكّر — زاوج — شارك', ['فكّر وحدك دقيقتين في السؤال', 'ناقش زميلك وقارنا إجابتيكما', 'شارك الصف بما اتفقتما عليه'], 'pairs', 8, 'إجابة مشتركة مكتوبة')] },
    },
    {
      id: 'builtin:block-kwl',
      kind: 'block',
      title: 'جدول أعرف — أريد أن أعرف — تعلمت',
      description: 'ملخص بثلاثة أعمدة يُملأ في بداية الدرس ونهايته.',
      tags: ['KWL', 'تقويم قبلي', 'قالب جاهز'],
      createdAt: T0,
      updatedAt: T0,
      data: {
        blocks: [
          summary('جدول KWL', 'grid', [
            ['ماذا أعرف؟', 'ما أعرفه عن الموضوع قبل الدرس'],
            ['ماذا أريد أن أعرف؟', 'أسئلتي عن الموضوع'],
            ['ماذا تعلمت؟', 'ما تعلمته بعد الدرس'],
          ]),
        ],
      },
    },
    {
      id: 'builtin:block-exit',
      kind: 'block',
      title: 'بطاقة خروج',
      description: 'ثلاثة أسئلة سريعة في آخر الحصة لقياس الفهم.',
      tags: ['تقويم ختامي', 'بطاقة خروج', 'قالب جاهز'],
      createdAt: T0,
      updatedAt: T0,
      data: {
        blocks: [
          activity('بطاقة الخروج', ['اكتب فكرة واحدة تعلمتها اليوم', 'اكتب سؤالًا ما زال يحيّرك', 'قيّم فهمك من 1 إلى 5'], 'individual', 5, 'بطاقة مكتوبة تُسلَّم عند الخروج'),
        ],
      },
    },
    {
      id: 'builtin:design-frayer',
      kind: 'design',
      title: 'نموذج فراير للمفهوم',
      description: 'ملخص بصري بأربعة مربعات حول المفهوم: التعريف، والخصائص، والأمثلة، واللاأمثلة.',
      tags: ['مفاهيم', 'ملخص بصري', 'قالب جاهز'],
      createdAt: T0,
      updatedAt: T0,
      data: {
        kind: 'summary',
        theme: 'paper',
        data: {
          heading: 'المفهوم',
          subtitle: 'نموذج فراير',
          style: 'central',
          points: [
            { id: newId(), title: 'التعريف', text: '…' },
            { id: newId(), title: 'الخصائص', text: '…' },
            { id: newId(), title: 'أمثلة', text: '…' },
            { id: newId(), title: 'لا أمثلة', text: '…' },
          ],
        },
      },
    },
  ];
}

export const isBuiltin = (id: string) => id.startsWith('builtin:');
