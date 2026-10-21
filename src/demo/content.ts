/**
 * Phase 7 — the demo project: «وحدة الأمن الرقمي», Technology Education, grade 8.
 *
 * Plain data in the app's own record shapes. Every id starts with DEMO_PREFIX, so demo
 * records can always be told apart from the teacher's own work and removed without
 * touching anything else (see install.ts). Nothing here is written by itself: install.ts
 * turns it into records and builds the students' attempts with the app's own grader.
 */
import type { Block, BloomLevel, LessonDoc, Objective } from '../lesson/types';
import type { Question, QuizSettings, TextMatch } from '../quiz/types';
import type { Design } from '../studio/types';

export const DEMO_PREFIX = 'demo-';
export const DEMO_PROJECT_ID = 'demo-project-digital-safety';
/** Bump when the demo content changes, so «reset» can tell an older copy apart. */
export const DEMO_VERSION = 1;

export const isDemoId = (id: string | null | undefined): boolean => typeof id === 'string' && id.startsWith(DEMO_PREFIX);

/* ───────── small builders ───────── */

const obj = (id: string, level: BloomLevel, verb: string, content: string, condition: string, criterion: string): Objective => ({ id, level, verb, content, condition, criterion });
const h = (id: string, text: string, objectiveIds: string[] = []): Block => ({ id, type: 'heading', text, level: 2, objectiveIds });
const t = (id: string, text: string, objectiveIds: string[] = []): Block => ({ id, type: 'text', text, objectiveIds });
const img = (id: string, assetId: string, alt: string, caption: string, objectiveIds: string[] = []): Block => ({ id, type: 'image', assetId, alt, decorative: false, caption, objectiveIds });
const cards = (id: string, title: string, list: [string, string][], objectiveIds: string[] = []): Block => ({
  id,
  type: 'cards',
  title,
  cards: list.map(([front, back], i) => ({ id: `${id}-c${i + 1}`, front, back })),
  objectiveIds,
});
const summary = (id: string, title: string, style: 'grid' | 'steps' | 'central', points: [string, string][], objectiveIds: string[] = []): Block => ({
  id,
  type: 'summary',
  title,
  style,
  points: points.map(([title, text], i) => ({ id: `${id}-p${i + 1}`, title, text })),
  objectiveIds,
});
const activity = (
  id: string,
  title: string,
  grouping: 'individual' | 'pairs' | 'groups' | 'class',
  duration: number,
  steps: string[],
  materials: string,
  output: string,
  objectiveIds: string[] = [],
  track: 'core' | 'remedial' | 'enrichment' = 'core',
  submit = false,
): Block => ({ id, type: 'activity', title, grouping, duration, steps: steps.join('\n'), materials, output, objectiveIds, track, submit });

const MATCH: TextMatch = { normalize: true, ignorePunctuation: true, typos: 1, reviewAllMismatches: false };

export const DEMO_QUIZ_SETTINGS: QuizSettings = {
  passPercent: 60,
  shuffleQuestions: false,
  shuffleOptions: true,
  showScore: true,
  showCorrectAnswers: true,
  showFeedback: true,
  feedbackTiming: 'end',
  scorePolicy: 'best',
  maxAttempts: 3,
  timeLimit: 0,
};

/* ───────── project ───────── */

export const DEMO_PROJECT = {
  id: DEMO_PROJECT_ID,
  title: 'وحدة الأمن الرقمي',
  subject: 'التربية التكنولوجية',
  grade: 'الصف الثامن',
  description:
    'مشروع تجريبي جاهز لتجربة التطبيق: ثلاثة دروس كاملة بأهدافها ومحتواها وأنشطتها، واختبار لكل درس، ونتائج عشرة طلاب تجريبيين، وثلاثة تصاميم. يمكن تعديله بحرية، وحذفه من «الإعدادات» دون أن يمس مشاريعك.',
  tags: ['محتوى تجريبي', 'الأمن الرقمي', 'المواطنة الرقمية'],
  color: 'teal' as const,
};

/* ───────── lessons ───────── */

export interface DemoLesson {
  id: string;
  title: string;
  summary: string;
  duration: number;
  /** The lesson's picture, shipped with the app in public/demo/. */
  image: { assetId: string; file: string; name: string };
  doc: Omit<LessonDoc, 'lessonId' | 'rev' | 'updatedAt' | 'schema'>;
}

const L1 = 'demo-lesson-1';
const L2 = 'demo-lesson-2';
const L3 = 'demo-lesson-3';

export const DEMO_LESSONS: DemoLesson[] = [
  {
    id: L1,
    title: 'كلمات المرور القوية والتحقق بخطوتين',
    summary: 'يميّز الطلاب كلمة المرور القوية من الضعيفة، ويفهمون كيف يحمي التحقق بخطوتين حساباتهم، ثم يصمّم كل منهم عبارة مرور قوية يسهل تذكّرها.',
    duration: 45,
    image: { assetId: 'demo-asset-1', file: 'password-strength.png', name: 'مقياس قوة كلمة المرور.png' },
    doc: {
      audience: 'الطالب',
      objectives: [
        obj('demo-l1-o1', 1, 'يعدّد', 'خصائص كلمة المرور القوية', 'دون الرجوع إلى الكتاب', 'بذكر أربع خصائص على الأقل'),
        obj('demo-l1-o2', 2, 'يشرح', 'كيف يحمي التحقق بخطوتين الحساب حتى لو سُرقت كلمة المرور', 'بلغته الخاصة', 'في ثلاث جمل صحيحة'),
        obj('demo-l1-o3', 4, 'يميّز', 'بين كلمات المرور القوية والضعيفة', 'من قائمة تضم عشر كلمات مرور', 'بدقة لا تقل عن 80٪'),
        obj('demo-l1-o4', 6, 'يصمّم', 'عبارة مرور قوية يسهل عليه تذكّرها', 'باستخدام طريقة الجملة', 'تحقق خصائص القوة الخمس'),
      ],
      strategies: ['inquiry', 'cooperative', 'direct'],
      strategyNotes:
        'يبدأ الدرس بسؤال استقصائي من حياة الطلاب («كم دقيقة يحتاج المخترق لتخمين كلمة مرورك؟») لإثارة الدافعية. ثم يكتشف الطلاب في أزواج خصائص كلمة المرور القوية بأنفسهم في «مختبر كلمات المرور» بدل تلقيها جاهزة، فيثبت الفهم لأنهم بنوه. الشرح المباشر قصير ومحصور في التحقق بخطوتين لأنه مفهوم إجرائي يحتاج تسلسلًا واضحًا. ينتهي الدرس بإنتاج فردي (تصميم عبارة مرور) ليصل الطلاب إلى مستوى الإبداع في بلوم.',
      assessmentTypes: ['diagnostic', 'formative', 'self'],
      assessmentTools: ['oral', 'checklist', 'quiz', 'exit'],
      assessmentNotes:
        'سؤال قبلي شفوي في البداية لمعرفة عادات الطلاب. أثناء النشاط: قائمة رصد لخصائص القوة يستخدمها الطالب لتقييم كلمته ذاتيًا. في الختام: اختبار قصير من ستة أسئلة مرتبطة بالأهداف، وبطاقة خروج.',
      blocks: [
        h('demo-l1-b1', 'لماذا نحمي حساباتنا؟', ['demo-l1-o1']),
        t(
          'demo-l1-b2',
          'تخيّل أن شخصًا غريبًا دخل حسابك في لعبتك المفضلة أو بريدك المدرسي. يستطيع أن يرسل رسائل باسمك، أو يحذف إنجازاتك، أو يطّلع على صورك.\n\nأغلب الحسابات تُخترق لسبب بسيط: **كلمة مرور ضعيفة** أو **مكررة** في أكثر من موقع. البرامج الآلية تجرّب ملايين الكلمات الشائعة في دقائق.\n\n- كلمة «123456» تُكسر في أقل من ثانية.\n- كلمة طويلة متنوعة الرموز تحتاج سنوات.',
          ['demo-l1-o1', 'demo-l1-o3'],
        ),
        img('demo-l1-b3', 'demo-asset-1', 'قفل أزرق بجانب حقلي كلمة مرور: الأول قصير ومقياس قوته أحمر قصير، والثاني طويل ومقياس قوته أخضر ممتلئ مع علامة صح، وهاتف يعرض رمز تحقق.', 'كلما طالت كلمة المرور وتنوّعت رموزها امتلأ مقياس القوة.', ['demo-l1-o1', 'demo-l1-o3']),
        h('demo-l1-b4', 'خصائص كلمة المرور القوية', ['demo-l1-o1']),
        cards(
          'demo-l1-b5',
          'خمس خصائص — اقلب البطاقة',
          [
            ['الطول', '12 حرفًا على الأقل؛ الطول أهم من التعقيد.'],
            ['التنوع', 'أحرف كبيرة وصغيرة وأرقام ورموز مثل # ! @.'],
            ['لا معلومات شخصية', 'لا اسمك ولا تاريخ ميلادك ولا اسم مدرستك.'],
            ['لا تكرار', 'كلمة مختلفة لكل حساب مهم.'],
            ['لا كلمات قاموس', 'تجنّب الكلمات الشائعة مثل password وqwerty.'],
          ],
          ['demo-l1-o1'],
        ),
        activity(
          'demo-l1-b6',
          'مختبر كلمات المرور',
          'pairs',
          10,
          ['اقرأ مع زميلك بطاقة الكلمات العشر', 'صنّفا كل كلمة: قوية أم ضعيفة', 'اكتبا سبب الحكم بجانب كل كلمة', 'حسّنا كلمتين ضعيفتين لتصبحا قويتين'],
          'بطاقة فيها عشر كلمات مرور، قائمة رصد الخصائص الخمس',
          'جدول تصنيف مكتمل مع الأسباب',
          ['demo-l1-o3'],
        ),
        h('demo-l1-b7', 'التحقق بخطوتين', ['demo-l1-o2']),
        t(
          'demo-l1-b8',
          'حتى أقوى كلمة مرور قد تُسرق. لذلك تطلب المواقع الآمنة **شيئين**: شيئًا **تعرفه** (كلمة المرور) وشيئًا **تملكه** (هاتفك).\n\nإذا عرف المخترق كلمة مرورك فلن يستطيع الدخول، لأن الرمز المؤقت يصل إلى هاتفك أنت فقط.',
          ['demo-l1-o2'],
        ),
        summary(
          'demo-l1-b9',
          'كيف يعمل التحقق بخطوتين؟',
          'steps',
          [
            ['تكتب كلمة المرور', 'الخطوة الأولى: شيء تعرفه.'],
            ['يصل رمز إلى هاتفك', 'رمز مؤقت من ستة أرقام.'],
            ['تُدخل الرمز', 'خلال دقيقة أو دقيقتين.'],
            ['يُفتح الحساب', 'لأنك أثبتّ هويتك مرتين.'],
          ],
          ['demo-l1-o2'],
        ),
        activity(
          'demo-l1-b12',
          'مثّلا الخطوتين',
          'pairs',
          4,
          ['يمثّل أحدكما دور الموقع والآخر دور صاحب الحساب', 'يطلب «الموقع» كلمة المرور ثم الرمز', 'يشرح «صاحب الحساب» لماذا لا يكفي أن يعرف المخترق كلمة المرور'],
          'لا شيء',
          'شرح شفوي من ثلاث جمل',
          ['demo-l1-o2'],
        ),
        h('demo-l1-b10', 'صمّم عبارتك', ['demo-l1-o4']),
        t(
          'demo-l1-b13',
          '**طريقة الجملة:** اختر جملة تتذكرها، ثم خذ أول حرف من كل كلمة، وأضف رقمًا ورمزًا.\n\nمثال للشرح فقط (لا تستخدمه): الجملة «My cat Lulu sleeps on my bed at 9 pm!» تصبح **McLsomb@9pm!** (12 رمزًا) — قوية وسهلة التذكّر لمن يعرف الجملة.',
          ['demo-l1-o4'],
        ),
        activity(
          'demo-l1-b11',
          'عبارة مرور لا تُنسى',
          'individual',
          8,
          ['اختر جملة تحبها ولا يعرفها غيرك', 'خذ أول حرف من كل كلمة', 'أضف رقمًا ورمزًا في مكانين غير متوقعين', 'افحص عبارتك بقائمة الخصائص الخمس'],
          'قائمة رصد الخصائص الخمس',
          'عبارة مرور تحقق الخصائص الخمس (لا تُكتب على الورق، يكتب الطالب طريقته فقط)',
          ['demo-l1-o4'],
          'core',
          true,
        ),
        // 1.1.0: shown at the end of the lesson by a fixed rule on the learner's latest quiz result.
        activity(
          'demo-l1-b14',
          'مراجعة موجّهة: الخصائص الخمس',
          'individual',
          8,
          ['أعد قلب بطاقات الخصائص الخمس واحدة واحدة', 'اكتب كل خاصية بكلماتك ومثالًا عليها', 'افحص كلمتين من مختبر كلمات المرور بالخصائص الخمس من جديد'],
          'بطاقات الخصائص الخمس',
          'قائمة الخصائص الخمس بكلماتك مع مثال لكل خاصية',
          ['demo-l1-o1', 'demo-l1-o3'],
          'remedial',
        ),
        activity(
          'demo-l1-b15',
          'تحدٍّ: دليل أمان لعائلتك',
          'individual',
          15,
          ['اختر ثلاثة حسابات تستخدمها عائلتك', 'اقترح لكل حساب طريقة حماية: عبارة مرور وتحقق بخطوتين', 'اكتب الدليل في خمس نقاط يفهمها أي فرد في العائلة'],
          'ورقة أو ملف نصي',
          'دليل أمان من خمس نقاط',
          ['demo-l1-o2', 'demo-l1-o4'],
          'enrichment',
        ),
      ],
    },
  },
  {
    id: L2,
    title: 'التصيّد الاحتيالي: كيف تكشف الرسائل المزيفة؟',
    summary: 'يتعرف الطلاب على التصيّد الاحتيالي، ويحللون رسائل مشبوهة لاستخراج علامات الاحتيال، ويتدربون على الإجراء الآمن عبر لعب الأدوار.',
    duration: 45,
    image: { assetId: 'demo-asset-2', file: 'phishing.png', name: 'خطاف التصيد.png' },
    doc: {
      audience: 'الطالب',
      objectives: [
        obj('demo-l2-o1', 1, 'يعرّف', 'التصيّد الاحتيالي', 'بلغته الخاصة', 'تعريفًا يتضمن الهدف والوسيلة'),
        obj('demo-l2-o2', 2, 'يصنّف', 'علامات الرسالة المشبوهة', 'بعد دراسة ثلاث رسائل', 'إلى أربع فئات صحيحة'),
        obj('demo-l2-o3', 4, 'يحلّل', 'رسالة مشبوهة لاستخراج علامات الاحتيال فيها', 'باستخدام قائمة الرصد', 'بثلاث علامات على الأقل'),
        obj('demo-l2-o4', 5, 'يقيّم', 'الإجراء المناسب عند تلقي رسالة مشبوهة', 'في مواقف تمثيلية', 'باختيار الإجراء الآمن في كل موقف'),
      ],
      strategies: ['problem', 'cooperative', 'roleplay'],
      strategyNotes:
        'يُبنى الدرس على مشكلة حقيقية: رسالة وصلت فعلًا لطالب في صفهم. العمل في مجموعات «المحقق الرقمي» يجعل تحليل الرسالة نشاطًا اجتماعيًا يتبادل فيه الطلاب الأدلة. لعب الأدوار في الختام ينقل المعرفة إلى سلوك: الطالب يتدرب على قول «لا» والضغط على «إبلاغ» بدل «الرابط»، وهذا ما يقيس هدف التقويم.',
      assessmentTypes: ['formative', 'peer', 'summative'],
      assessmentTools: ['observation', 'rubric', 'quiz'],
      assessmentNotes: 'ملاحظة أداء المجموعات بقائمة علامات الاحتيال، وتقييم الأقران لتقارير المجموعات بسلّم من ثلاث درجات، واختبار ختامي قصير.',
      blocks: [
        h('demo-l2-b1', 'ما التصيّد الاحتيالي؟', ['demo-l2-o1']),
        t(
          'demo-l2-b2',
          'التصيّد الاحتيالي محاولة **لخداعك** كي تكشف بياناتك السرية، مثل كلمة المرور أو رقم البطاقة، برسالة تبدو صادرة عن جهة تثق بها: بنك، أو مدرسة، أو لعبة، أو صديق.\n\nسُمّي «تصيّدًا» لأن المحتال يرمي «طُعمًا» إلى آلاف الأشخاص وينتظر من يبتلعه.',
          ['demo-l2-o1'],
        ),
        img('demo-l2-b3', 'demo-asset-2', 'خطاف صيد معلّق بخيط يمسك رسالة بريد إلكتروني، وبجانبه علامة تحذير برتقالية ودرع أخضر بعلامة صح.', 'الرسالة المزيفة طُعم؛ والدرع هو تصرفك الآمن.', ['demo-l2-o1']),
        h('demo-l2-b4', 'علامات الرسالة المشبوهة', ['demo-l2-o2']),
        summary(
          'demo-l2-b5',
          'أربع علامات تكشف الاحتيال',
          'grid',
          [
            ['مرسل مزيّف', 'عنوان يشبه الحقيقي مع اختلاف حرف: paypa1 بدل paypal.'],
            ['استعجال وتهديد', '«سيُغلق حسابك خلال ساعة!»'],
            ['رابط مخادع', 'النص يقول شيئًا والرابط الحقيقي يذهب لمكان آخر.'],
            ['طلب بيانات سرية', 'لا توجد جهة موثوقة تطلب كلمة مرورك برسالة.'],
          ],
          ['demo-l2-o2', 'demo-l2-o3'],
        ),
        cards(
          'demo-l2-b6',
          'مصطلحات الدرس',
          [
            ['التصيّد الاحتيالي', 'خداع برسالة مزيفة للحصول على بيانات سرية.'],
            ['الانتحال', 'التظاهر بأنك شخص أو جهة أخرى.'],
            ['الهندسة الاجتماعية', 'خداع يستغل مشاعر الإنسان: الخوف والفضول والطمع.'],
            ['الإبلاغ', 'إخبار الموقع أو المعلم أو ولي الأمر عن الرسالة.'],
          ],
          ['demo-l2-o1', 'demo-l2-o2'],
        ),
        h('demo-l2-b7', 'المحقق الرقمي', ['demo-l2-o3']),
        activity(
          'demo-l2-b8',
          'حلّل الرسالة',
          'groups',
          15,
          ['اقرأوا الرسالة المطبوعة بعناية', 'ضعوا دائرة حول كل علامة مشبوهة', 'صنّفوا العلامات في الفئات الأربع', 'اكتبوا تقريرًا من ثلاثة أسطر: هل الرسالة احتيال؟ ولماذا؟'],
          'ثلاث رسائل مطبوعة (واحدة سليمة واثنتان احتيال)، قائمة العلامات الأربع',
          'تقرير مجموعة يُعرض على الصف',
          ['demo-l2-o3', 'demo-l2-o2'],
        ),
        h('demo-l2-b9', 'ماذا أفعل لو وصلتني؟', ['demo-l2-o4']),
        activity(
          'demo-l2-b10',
          'لعب أدوار: الرسالة العاجلة',
          'class',
          10,
          ['يمثّل طالب دور المحتال ويقرأ رسالة عاجلة', 'يختار طالب آخر تصرفه أمام الصف', 'يصوّت الصف: هل كان التصرف آمنًا؟', 'نتفق معًا على الخطوات الأربع الآمنة'],
          'بطاقات مواقف',
          'قائمة الخطوات الآمنة على السبورة',
          ['demo-l2-o4'],
        ),
        t('demo-l2-b11', '**الخطوات الآمنة:**\n\n- لا تضغط على الرابط ولا تفتح المرفق.\n- تحقق من المرسل بطريقة أخرى: اتصل بالجهة أو اسأل صديقك مباشرة.\n- أبلغ معلمك أو ولي أمرك.\n- احذف الرسالة.', ['demo-l2-o4']),
      ],
    },
  },
  {
    id: L3,
    title: 'بصمتي الرقمية وخصوصيتي',
    summary: 'يفهم الطلاب أن كل ما يفعلونه على الإنترنت يترك أثرًا، ويضبطون إعدادات الخصوصية، ويطبقون قاعدة «فكّر قبل أن تنشر».',
    duration: 45,
    image: { assetId: 'demo-asset-3', file: 'footprint.png', name: 'البصمة الرقمية.png' },
    doc: {
      audience: 'الطالب',
      objectives: [
        obj('demo-l3-o1', 2, 'يوضّح', 'مفهوم البصمة الرقمية بنوعيها', 'بمثال من حياته اليومية', 'بصورة صحيحة'),
        obj('demo-l3-o2', 3, 'يطبّق', 'إعدادات الخصوصية على حساب تواصل اجتماعي', 'على حساب تجريبي', 'بضبط ثلاثة إعدادات على الأقل'),
        obj('demo-l3-o3', 4, 'يفرّق بين', 'المعلومات التي يجوز نشرها والتي يجب إخفاؤها', 'من قائمة منشورات', 'بدقة 80٪'),
        obj('demo-l3-o4', 5, 'يبرّر', 'قراره قبل نشر محتوى على الإنترنت', 'وفق قاعدة «فكّر قبل أن تنشر»', 'بحجتين منطقيتين'),
      ],
      strategies: ['discussion', 'project', 'self'],
      strategyNotes:
        'الخصوصية موضوع قيمي، لذلك تقود المناقشة الموجّهة الدرس: الطلاب يحكمون على منشورات حقيقية ويبررون أحكامهم. التطبيق العملي على حساب تجريبي يحوّل المعرفة إلى مهارة. ومشروع الملصق في الختام يجمع ما تعلموه في الوحدة كلها ويُعرض في المدرسة.',
      assessmentTypes: ['formative', 'self', 'summative'],
      assessmentTools: ['task', 'portfolio', 'quiz'],
      assessmentNotes: 'مهمة أداء: ضبط إعدادات الخصوصية مع لقطة شاشة. ملف إنجاز للوحدة يضم ملصق المجموعة. اختبار قصير ختامي.',
      blocks: [
        h('demo-l3-b1', 'ما البصمة الرقمية؟', ['demo-l3-o1']),
        t(
          'demo-l3-b2',
          'كل ما تفعله على الإنترنت يترك **أثرًا** يبقى طويلًا: منشوراتك وتعليقاتك وصورك، وحتى المواقع التي تزورها.\n\n- **البصمة النشطة:** ما تنشره بنفسك، مثل تعليق أو صورة.\n- **البصمة السلبية:** ما يُجمع عنك دون أن تنتبه، مثل موقعك وسجل تصفحك.',
          ['demo-l3-o1'],
        ),
        img('demo-l3-b3', 'demo-asset-3', 'آثار أقدام زرقاء تمتد نحو حاسوب وهاتف، وعين تراقب من الأعلى.', 'كل خطوة على الإنترنت تترك أثرًا تجمعه الأجهزة والمواقع.', ['demo-l3-o1']),
        cards(
          'demo-l3-b4',
          'مفاهيم أساسية',
          [
            ['بصمة نشطة', 'ما تنشره بقصد: منشور، صورة، تعليق.'],
            ['بصمة سلبية', 'ما يُجمع عنك تلقائيًا: الموقع، الإعجابات، سجل التصفح.'],
            ['إعدادات الخصوصية', 'خيارات تحدد من يرى منشوراتك ومعلوماتك.'],
            ['الإذن', 'لا تنشر صورة أحد دون موافقته.'],
          ],
          ['demo-l3-o1'],
        ),
        h('demo-l3-b5', 'أنشر أم لا أنشر؟', ['demo-l3-o3', 'demo-l3-o4']),
        activity(
          'demo-l3-b6',
          'صنّف المنشورات',
          'pairs',
          10,
          ['اقرأ مع زميلك بطاقات المنشورات الثماني', 'ضعا كل بطاقة في عمود: يُنشر / لا يُنشر', 'اكتبا مبررًا لكل قرار بقاعدة «فكّر قبل أن تنشر»'],
          'ثماني بطاقات منشورات، لوحة بعمودين',
          'لوحة تصنيف مع المبررات',
          ['demo-l3-o3', 'demo-l3-o4'],
        ),
        summary(
          'demo-l3-b7',
          'فكّر قبل أن تنشر',
          'central',
          [
            ['هل هو صحيح؟', 'لا تنشر شائعة.'],
            ['هل هو مفيد؟', 'هل يضيف شيئًا لمن يقرؤه؟'],
            ['هل هو لطيف؟', 'هل يجرح أحدًا؟'],
            ['هل هو آمن؟', 'هل يكشف مكانك أو معلوماتك؟'],
          ],
          ['demo-l3-o4', 'demo-l3-o3'],
        ),
        h('demo-l3-b8', 'اضبط خصوصيتك', ['demo-l3-o2']),
        t(
          'demo-l3-b12',
          'أغلب التطبيقات تجعل حسابك **عامًا** في البداية. ثلاثة إعدادات تحميك:\n\n- **الحساب الخاص:** لا يرى منشوراتك إلا من توافق عليهم.\n- **مشاركة الموقع:** أوقفها، فهي تكشف أين أنت الآن.\n- **من يراسلني:** الأصدقاء فقط.',
          ['demo-l3-o2'],
        ),
        activity(
          'demo-l3-b9',
          'جولة في الإعدادات',
          'individual',
          10,
          ['افتح إعدادات الحساب التجريبي', 'اجعل الحساب خاصًا', 'أوقف مشاركة الموقع', 'حدد من يستطيع إرسال الرسائل إليك', 'خذ لقطة شاشة للإعدادات بعد ضبطها'],
          'حساب تجريبي يوفره المعلم على جهاز المختبر',
          'لقطة شاشة لثلاثة إعدادات مضبوطة',
          ['demo-l3-o2'],
        ),
        h('demo-l3-b10', 'مشروع الوحدة', ['demo-l3-o4']),
        activity(
          'demo-l3-b11',
          'ملصق «أنا مواطن رقمي آمن»',
          'groups',
          20,
          ['اختاروا رسالة واحدة من دروس الوحدة الثلاثة', 'صمّموا ملصقًا بصورة وثلاث نصائح', 'اعرضوا الملصق على الصف وبرّروا اختياركم'],
          'ورق كبير وأقلام، أو استوديو التصميم',
          'ملصق يُعلّق في المدرسة',
          ['demo-l3-o4'],
        ),
      ],
    },
  },
];

/* ───────── quizzes ───────── */

export interface DemoQuiz {
  id: string;
  lessonId: string;
  title: string;
  description: string;
  questions: Question[];
}

export const DEMO_QUIZZES: DemoQuiz[] = [
  {
    id: 'demo-quiz-1',
    lessonId: L1,
    title: 'اختبار: كلمات المرور والتحقق بخطوتين',
    description: 'ستة أسئلة تقيس أهداف الدرس الأول. لديك ثلاث محاولات، وتُعتمد أعلى درجة.',
    questions: [
      {
        id: 'demo-q1-1',
        type: 'mcq',
        prompt: 'أيّ كلمات المرور الآتية هي الأقوى؟',
        points: 1,
        objectiveIds: ['demo-l1-o1'],
        bloom: 1,
        options: [
          { id: 'demo-q1-1-a', text: 'ahmad2010', feedback: 'فيها اسم وسنة ميلاد، وهما أول ما يجرّبه المخترق.' },
          { id: 'demo-q1-1-b', text: '12345678', feedback: 'هذه من أكثر كلمات المرور شيوعًا في العالم.' },
          { id: 'demo-q1-1-c', text: 'Qalam#Sahra!92Wady', feedback: '' },
          { id: 'demo-q1-1-d', text: 'password', feedback: 'كلمة قاموس معروفة تُكسر فورًا.' },
        ],
        correct: ['demo-q1-1-c'],
        multiple: false,
        partial: false,
        feedbackCorrect: 'أحسنت: طويلة، متنوعة الرموز، وليست كلمة معروفة.',
        feedbackIncorrect: 'الأقوى هي الأطول والأكثر تنوعًا والخالية من المعلومات الشخصية.',
      },
      {
        id: 'demo-q1-2',
        type: 'truefalse',
        prompt: 'يُنصح باستخدام كلمة المرور نفسها لكل حساباتك حتى لا تنساها.',
        points: 1,
        objectiveIds: ['demo-l1-o1'],
        bloom: 1,
        answer: false,
        feedbackCorrect: 'صحيح: إذا سُرقت كلمة واحدة فُتحت كل حساباتك.',
        feedbackIncorrect: 'تكرار كلمة المرور يجعل اختراق حساب واحد يفتح كل الحسابات.',
      },
      {
        id: 'demo-q1-3',
        type: 'matching',
        prompt: 'طابِق كل كلمة مرور ضعيفة مع سبب ضعفها.',
        points: 2,
        objectiveIds: ['demo-l1-o3'],
        bloom: 4,
        pairs: [
          { id: 'demo-q1-3-p1', left: 'qwerty123', right: 'تسلسل معروف على لوحة المفاتيح' },
          { id: 'demo-q1-3-p2', left: 'Ahmad2009', right: 'معلومات شخصية يسهل تخمينها' },
          { id: 'demo-q1-3-p3', left: 'Sun1', right: 'قصيرة جدًا' },
          { id: 'demo-q1-3-p4', left: 'football', right: 'كلمة من القاموس' },
        ],
        distractors: ['تحتوي رموزًا متنوعة'],
        partial: true,
        feedbackCorrect: 'ممتاز، ميّزت كل أسباب الضعف.',
        feedbackIncorrect: 'راجع بطاقات الخصائص الخمس: الطول، التنوع، المعلومات الشخصية، التكرار، كلمات القاموس.',
      },
      {
        id: 'demo-q1-4',
        type: 'ordering',
        prompt: 'رتّب خطوات الدخول إلى حساب مفعّل فيه التحقق بخطوتين.',
        points: 2,
        objectiveIds: ['demo-l1-o2'],
        bloom: 2,
        items: [
          { id: 'demo-q1-4-i1', text: 'تكتب اسم المستخدم وكلمة المرور' },
          { id: 'demo-q1-4-i2', text: 'يرسل الموقع رمزًا مؤقتًا إلى هاتفك' },
          { id: 'demo-q1-4-i3', text: 'تُدخل الرمز خلال وقت قصير' },
          { id: 'demo-q1-4-i4', text: 'يُفتح الحساب' },
        ],
        partial: true,
        feedbackCorrect: 'ترتيب صحيح.',
        feedbackIncorrect: 'الخطوة الأولى دائمًا كلمة المرور، ثم الرمز الذي يصل إلى هاتفك.',
      },
      {
        id: 'demo-q1-5',
        type: 'fill',
        prompt: 'أكمل الفراغين.',
        points: 2,
        objectiveIds: ['demo-l1-o2'],
        bloom: 2,
        text: 'التحقق بخطوتين يطلب شيئًا [[تعرفه|تعرفه أنت]] مثل كلمة المرور، وشيئًا [[تملكه|تملكه أنت|تمتلكه]] مثل الهاتف.',
        match: MATCH,
        partial: true,
        feedbackCorrect: 'أحسنت.',
        feedbackIncorrect: 'شيء تعرفه (كلمة المرور) وشيء تملكه (الهاتف).',
      },
      {
        id: 'demo-q1-6',
        type: 'short',
        prompt: 'ما أقل عدد من الأحرف يُنصح به لكلمة المرور القوية؟ اكتب الرقم.',
        points: 1,
        objectiveIds: ['demo-l1-o1'],
        bloom: 1,
        accepted: ['12', 'اثنا عشر', 'اثني عشر'],
        match: MATCH,
        feedbackCorrect: 'صحيح: 12 حرفًا على الأقل.',
        feedbackIncorrect: 'يُنصح بـ12 حرفًا على الأقل.',
      },
    ],
  },
  {
    id: 'demo-quiz-2',
    lessonId: L2,
    title: 'اختبار: كشف التصيّد الاحتيالي',
    description: 'سبعة أسئلة عن التصيّد الاحتيالي وعلاماته والتصرف الآمن.',
    questions: [
      {
        id: 'demo-q2-1',
        type: 'mcq',
        prompt: 'وصلتك رسالة: «حسابك سيُغلق خلال ساعة! اضغط هنا لتأكيد كلمة المرور». ما أوضح علامة احتيال فيها؟',
        points: 1,
        objectiveIds: ['demo-l2-o3'],
        bloom: 4,
        options: [
          { id: 'demo-q2-1-a', text: 'الاستعجال والتهديد مع طلب كلمة المرور', feedback: '' },
          { id: 'demo-q2-1-b', text: 'أنها مكتوبة باللغة العربية', feedback: 'اللغة ليست علامة احتيال بحد ذاتها.' },
          { id: 'demo-q2-1-c', text: 'أنها وصلت في الصباح', feedback: 'وقت الوصول لا يدل على شيء.' },
          { id: 'demo-q2-1-d', text: 'أنها قصيرة', feedback: 'الطول ليس علامة؛ المهم المضمون والطلب.' },
        ],
        correct: ['demo-q2-1-a'],
        multiple: false,
        partial: false,
        feedbackCorrect: 'بالضبط: التهديد بوقت قصير وطلب كلمة المرور علامتان واضحتان.',
        feedbackIncorrect: 'ابحث عن الاستعجال والتهديد وطلب البيانات السرية.',
      },
      {
        id: 'demo-q2-2',
        type: 'mcq',
        prompt: 'اختر كل العلامات التي تجعل الرسالة مشبوهة.',
        points: 2,
        objectiveIds: ['demo-l2-o2'],
        bloom: 2,
        options: [
          { id: 'demo-q2-2-a', text: 'عنوان المرسل support@paypa1.com', feedback: 'الرقم 1 مكان حرف l: انتحال.' },
          { id: 'demo-q2-2-b', text: '«مبروك! ربحت هاتفًا، أرسل عنوانك»', feedback: 'إغراء بجائزة لم تشترك فيها.' },
          { id: 'demo-q2-2-c', text: 'رسالة من معلمك بموعد الاختبار داخل منصة المدرسة', feedback: 'هذه رسالة عادية متوقعة من مصدر تعرفه.' },
          { id: 'demo-q2-2-d', text: 'رابط نصه bank.com لكنه يذهب إلى bank-login.xyz', feedback: 'رابط مخادع.' },
        ],
        correct: ['demo-q2-2-a', 'demo-q2-2-b', 'demo-q2-2-d'],
        multiple: true,
        partial: true,
        feedbackCorrect: 'ممتاز، اكتشفت العلامات الثلاث.',
        feedbackIncorrect: 'العلامات: مرسل مزيف، إغراء بجائزة، رابط مخادع.',
      },
      {
        id: 'demo-q2-3',
        type: 'truefalse',
        prompt: 'البنوك والمدارس الرسمية تطلب كلمة المرور عبر البريد الإلكتروني عند تحديث أنظمتها.',
        points: 1,
        objectiveIds: ['demo-l2-o1'],
        bloom: 1,
        answer: false,
        feedbackCorrect: 'صحيح: لا توجد جهة موثوقة تطلب كلمة مرورك برسالة.',
        feedbackIncorrect: 'لا تطلب أي جهة موثوقة كلمة المرور برسالة؛ هذا طلب احتيالي دائمًا.',
      },
      {
        id: 'demo-q2-4',
        type: 'matching',
        prompt: 'طابِق كل جزء من رسالة مشبوهة مع فئة العلامة.',
        points: 2,
        objectiveIds: ['demo-l2-o2'],
        bloom: 2,
        pairs: [
          { id: 'demo-q2-4-p1', left: 'من: support@paypa1.com', right: 'انتحال مرسل موثوق' },
          { id: 'demo-q2-4-p2', left: '«ردّ خلال ساعة وإلا يُحذف حسابك»', right: 'استعجال وتهديد' },
          { id: 'demo-q2-4-p3', left: '«أرسل رقم بطاقتك للتحقق»', right: 'طلب بيانات سرية' },
          { id: 'demo-q2-4-p4', left: '«ربحت جائزة قيمة!»', right: 'إغراء بجائزة' },
        ],
        distractors: [],
        partial: true,
        feedbackCorrect: 'تصنيف صحيح.',
        feedbackIncorrect: 'راجع العلامات الأربع في ملخص الدرس.',
      },
      {
        id: 'demo-q2-5',
        type: 'ordering',
        prompt: 'رتّب الخطوات الآمنة عند تلقي رسالة مشبوهة.',
        points: 2,
        objectiveIds: ['demo-l2-o4'],
        bloom: 5,
        items: [
          { id: 'demo-q2-5-i1', text: 'لا تضغط على الرابط' },
          { id: 'demo-q2-5-i2', text: 'تحقق من المرسل بطريقة أخرى' },
          { id: 'demo-q2-5-i3', text: 'أبلغ معلمك أو ولي أمرك' },
          { id: 'demo-q2-5-i4', text: 'احذف الرسالة' },
        ],
        partial: true,
        feedbackCorrect: 'تصرف آمن ومرتب.',
        feedbackIncorrect: 'أولًا لا تضغط، ثم تحقق، ثم أبلغ، ثم احذف.',
      },
      {
        id: 'demo-q2-6',
        type: 'fill',
        prompt: 'أكمل التعريف.',
        points: 2,
        objectiveIds: ['demo-l2-o1'],
        bloom: 1,
        text: 'التصيّد الاحتيالي محاولة [[خداع|لخداع]] المستخدم ليكشف [[بياناته|معلوماته]] السرية.',
        match: MATCH,
        partial: true,
        feedbackCorrect: 'تعريف صحيح.',
        feedbackIncorrect: 'التصيّد خداع للحصول على البيانات السرية.',
      },
      {
        id: 'demo-q2-7',
        type: 'short',
        prompt: 'ما اسم الأسلوب الذي يستغل مشاعر الإنسان، كالخوف والفضول، لخداعه؟',
        points: 1,
        objectiveIds: ['demo-l2-o1'],
        bloom: 1,
        accepted: ['الهندسة الاجتماعية', 'هندسة اجتماعية'],
        match: MATCH,
        feedbackCorrect: 'صحيح: الهندسة الاجتماعية.',
        feedbackIncorrect: 'المصطلح هو «الهندسة الاجتماعية».',
      },
    ],
  },
  {
    id: 'demo-quiz-3',
    lessonId: L3,
    title: 'اختبار: البصمة الرقمية والخصوصية',
    description: 'ستة أسئلة تختم الوحدة.',
    questions: [
      {
        id: 'demo-q3-1',
        type: 'mcq',
        prompt: 'أيّ مما يأتي جزء من بصمتك الرقمية النشطة؟',
        points: 1,
        objectiveIds: ['demo-l3-o1'],
        bloom: 2,
        options: [
          { id: 'demo-q3-1-a', text: 'تعليق كتبته على مقطع فيديو', feedback: '' },
          { id: 'demo-q3-1-b', text: 'موقعك الذي يسجله الهاتف تلقائيًا', feedback: 'هذا جزء من البصمة السلبية: يُجمع دون أن تنشره.' },
          { id: 'demo-q3-1-c', text: 'سجل المواقع التي زرتها', feedback: 'هذا يُجمع تلقائيًا، فهو بصمة سلبية.' },
          { id: 'demo-q3-1-d', text: 'نوع جهازك', feedback: 'معلومة تُجمع تلقائيًا، لا تنشرها بنفسك.' },
        ],
        correct: ['demo-q3-1-a'],
        multiple: false,
        partial: false,
        feedbackCorrect: 'صحيح: نشرته بنفسك فهو بصمة نشطة.',
        feedbackIncorrect: 'النشطة هي ما تنشره بنفسك بقصد.',
      },
      {
        id: 'demo-q3-2',
        type: 'truefalse',
        prompt: 'حذف المنشور يزيله من الإنترنت نهائيًا، ولا يستطيع أحد الاحتفاظ بنسخة منه.',
        points: 1,
        objectiveIds: ['demo-l3-o3'],
        bloom: 2,
        answer: false,
        feedbackCorrect: 'صحيح: قد يكون أحدهم أخذ لقطة شاشة قبل الحذف.',
        feedbackIncorrect: 'المنشور قد يُحفظ أو يُصوَّر قبل حذفه، فكّر قبل أن تنشر.',
      },
      {
        id: 'demo-q3-3',
        type: 'matching',
        prompt: 'طابِق كل معلومة مع الحكم المناسب.',
        points: 2,
        objectiveIds: ['demo-l3-o3'],
        bloom: 4,
        pairs: [
          { id: 'demo-q3-3-p1', left: 'رقم هاتفك', right: 'معلومة اتصال خاصة لا تُنشر' },
          { id: 'demo-q3-3-p2', left: 'صورة جواز سفرك', right: 'وثيقة رسمية سرية' },
          { id: 'demo-q3-3-p3', left: 'رسم فني من إنجازك', right: 'يمكن نشره بأمان' },
          { id: 'demo-q3-3-p4', left: 'موقعك الآن', right: 'يكشف مكان وجودك' },
        ],
        distractors: ['يجب نشره دائمًا'],
        partial: true,
        feedbackCorrect: 'أحكام صحيحة.',
        feedbackIncorrect: 'المعلومات الشخصية والوثائق والموقع لا تُنشر.',
      },
      {
        id: 'demo-q3-4',
        type: 'ordering',
        prompt: 'رتّب خطوات ضبط خصوصية حسابك كما في النشاط.',
        points: 2,
        objectiveIds: ['demo-l3-o2'],
        bloom: 3,
        items: [
          { id: 'demo-q3-4-i1', text: 'افتح إعدادات الحساب' },
          { id: 'demo-q3-4-i2', text: 'اجعل الحساب خاصًا' },
          { id: 'demo-q3-4-i3', text: 'أوقف مشاركة الموقع' },
          { id: 'demo-q3-4-i4', text: 'حدد من يستطيع مراسلتك' },
        ],
        partial: true,
        feedbackCorrect: 'ممتاز.',
        feedbackIncorrect: 'ابدأ بفتح الإعدادات، ثم الحساب الخاص، ثم الموقع، ثم الرسائل.',
      },
      {
        id: 'demo-q3-5',
        type: 'fill',
        prompt: 'أكمل الفراغات.',
        points: 3,
        objectiveIds: ['demo-l3-o1'],
        bloom: 2,
        text: 'البصمة الرقمية هي [[الأثر|الأثر الرقمي]] الذي تتركه على الإنترنت، وتكون [[نشطة]] عندما تنشر بنفسك، و[[سلبية]] عندما تُجمع عنك دون أن تنتبه.',
        match: MATCH,
        partial: true,
        feedbackCorrect: 'أحسنت.',
        feedbackIncorrect: 'الأثر، نشطة، سلبية.',
      },
      {
        id: 'demo-q3-6',
        type: 'short',
        prompt: 'أكمل القاعدة بكلمة واحدة: «… قبل أن تنشر».',
        points: 1,
        objectiveIds: ['demo-l3-o4'],
        bloom: 5,
        accepted: ['فكر', 'فكّر', 'أفكر'],
        match: MATCH,
        feedbackCorrect: 'فكّر قبل أن تنشر.',
        feedbackIncorrect: 'القاعدة: «فكّر قبل أن تنشر».',
      },
    ],
  },
];

/* ───────── students ───────── */

/** Ten demo students. `skill` (0–1) shapes their answers; `quizzes` = which quizzes they took. */
export const DEMO_STUDENTS: { name: string; skill: number; quizzes: number }[] = [
  { name: 'سارة', skill: 0.95, quizzes: 3 },
  { name: 'يوسف', skill: 0.88, quizzes: 3 },
  { name: 'ليان', skill: 0.82, quizzes: 3 },
  { name: 'عمر', skill: 0.76, quizzes: 3 },
  { name: 'جنى', skill: 0.7, quizzes: 3 },
  { name: 'محمد', skill: 0.62, quizzes: 3 },
  { name: 'رهف', skill: 0.55, quizzes: 3 },
  { name: 'كريم', skill: 0.48, quizzes: 3 },
  { name: 'تالا', skill: 0.4, quizzes: 2 },
  { name: 'آدم', skill: 0.3, quizzes: 2 },
];

/* ───────── designs (studio) ───────── */

type DemoDesign = Omit<Design, 'createdAt' | 'updatedAt' | 'rev'>;

export const DEMO_DESIGNS: DemoDesign[] = [
  {
    id: 'demo-design-1',
    projectId: DEMO_PROJECT_ID,
    lessonId: null,
    kind: 'conceptmap',
    title: 'خريطة مفاهيم: الأمن الرقمي',
    theme: 'brand',
    data: {
      nodes: [
        { id: 'demo-n1', text: 'الأمن الرقمي', x: 480, y: 320, color: 0, shape: 'ellipse' },
        { id: 'demo-n2', text: 'كلمات المرور', x: 200, y: 140, color: 1, shape: 'rounded' },
        { id: 'demo-n3', text: 'التحقق بخطوتين', x: 160, y: 320, color: 1, shape: 'rounded' },
        { id: 'demo-n4', text: 'التصيّد الاحتيالي', x: 760, y: 140, color: 2, shape: 'rounded' },
        { id: 'demo-n5', text: 'علامات الاحتيال', x: 800, y: 320, color: 2, shape: 'rounded' },
        { id: 'demo-n6', text: 'البصمة الرقمية', x: 480, y: 540, color: 3, shape: 'rounded' },
        { id: 'demo-n7', text: 'إعدادات الخصوصية', x: 200, y: 540, color: 3, shape: 'rounded' },
        { id: 'demo-n8', text: 'فكّر قبل أن تنشر', x: 760, y: 540, color: 3, shape: 'rounded' },
      ],
      edges: [
        { id: 'demo-e1', from: 'demo-n1', to: 'demo-n2', label: 'يبدأ بـ' },
        { id: 'demo-e2', from: 'demo-n2', to: 'demo-n3', label: 'تقوّيها' },
        { id: 'demo-e3', from: 'demo-n1', to: 'demo-n4', label: 'يحمي من' },
        { id: 'demo-e4', from: 'demo-n4', to: 'demo-n5', label: 'يُكشف بـ' },
        { id: 'demo-e5', from: 'demo-n1', to: 'demo-n6', label: 'يشمل' },
        { id: 'demo-e6', from: 'demo-n6', to: 'demo-n7', label: 'تتحكم بها' },
        { id: 'demo-e7', from: 'demo-n6', to: 'demo-n8', label: 'تحميها قاعدة' },
      ],
    },
  },
  {
    id: 'demo-design-2',
    projectId: DEMO_PROJECT_ID,
    lessonId: L2,
    kind: 'cards',
    title: 'بطاقات: علامات الرسالة المشبوهة',
    theme: 'sunset',
    data: {
      show: 'both',
      columns: 2,
      cards: [
        { id: 'demo-d2-c1', front: 'مرسل مزيّف', back: 'عنوان يشبه الحقيقي مع اختلاف حرف.' },
        { id: 'demo-d2-c2', front: 'استعجال وتهديد', back: '«سيُغلق حسابك خلال ساعة!»' },
        { id: 'demo-d2-c3', front: 'رابط مخادع', back: 'النص شيء والوجهة الحقيقية شيء آخر.' },
        { id: 'demo-d2-c4', front: 'طلب بيانات سرية', back: 'لا جهة موثوقة تطلب كلمة مرورك برسالة.' },
      ],
    },
  },
  {
    id: 'demo-design-3',
    projectId: DEMO_PROJECT_ID,
    lessonId: L3,
    kind: 'summary',
    title: 'ملخص: فكّر قبل أن تنشر',
    theme: 'ocean',
    data: {
      heading: 'فكّر قبل أن تنشر',
      subtitle: 'أربعة أسئلة قبل كل منشور',
      style: 'steps',
      points: [
        { id: 'demo-d3-p1', title: 'هل هو صحيح؟', text: 'لا تنشر شائعة.' },
        { id: 'demo-d3-p2', title: 'هل هو مفيد؟', text: 'هل يضيف شيئًا لمن يقرؤه؟' },
        { id: 'demo-d3-p3', title: 'هل هو لطيف؟', text: 'هل يجرح أحدًا؟' },
        { id: 'demo-d3-p4', title: 'هل هو آمن؟', text: 'هل يكشف مكانك أو معلوماتك؟' },
      ],
    },
  },
];

/** Bloom level of every demo objective, for tests and the summary on the settings page. */
export const DEMO_OBJECTIVE_COUNT = DEMO_LESSONS.reduce((n, l) => n + l.doc.objectives.length, 0);
