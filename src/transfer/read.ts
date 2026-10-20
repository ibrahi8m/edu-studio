import { strFromU8, unzipSync } from 'fflate';
import { z } from 'zod';
import { SCHEMA_VERSION, type Lesson, type Project, type SettingRow } from '../db/db';
import { isSettingKey, loadSettingsFromRows } from '../db/settings';
import { normalizeDoc } from '../lesson/model';
import type { LessonDoc } from '../lesson/types';
import { normalizeLibraryItem } from '../library/model';
import { LIBRARY_OWNER, type LibraryItem } from '../library/types';
import { normalizeQuiz } from '../quiz/model';
import type { Attempt, Quiz } from '../quiz/types';
import type { LessonProgress } from '../student/types';
import { normalizeDesign } from '../studio/model';
import type { Design } from '../studio/types';
import { FORMAT, FORMAT_VERSION, MAX_FILE_BYTES, MAX_UNPACKED_BYTES, TransferError, type AssetMeta, type Manifest, type Package, type PackageData } from './format';
import { sha256 } from './pack';

/* ───────── schemas (Zod): structure and types; content is then cleaned by each model's normaliser ───────── */

const id = z.string().min(1).max(200);
const time = z.number().finite();
const status = z.enum(['draft', 'in_progress', 'ready', 'archived']);

const ManifestSchema = z.object({
  format: z.string(),
  formatVersion: z.number().int(),
  kind: z.enum(['project', 'backup']),
  schemaVersion: z.number().int().min(1),
  appVersion: z.string().max(40).default(''),
  exportedAt: z.string().max(40).default(''),
  title: z.string().max(300).default(''),
  counts: z.record(z.number()).default({}),
  dataSha256: z.string().regex(/^[0-9a-f]{64}$/),
  includesResults: z.boolean().default(false),
});

const ProjectSchema = z.object({
  id,
  title: z.string().min(1).max(200),
  subject: z.string().max(200).default(''),
  grade: z.string().max(200).default(''),
  description: z.string().max(5000).default(''),
  status: status.default('draft'),
  tags: z.array(z.string().max(60)).max(30).default([]),
  color: z.enum(['blue', 'silver', 'teal', 'violet', 'amber']).default('blue'),
  createdAt: time,
  updatedAt: time,
});

const LessonSchema = z.object({
  id,
  projectId: id,
  title: z.string().min(1).max(200),
  summary: z.string().max(5000).default(''),
  duration: z.number().min(0).max(10000).default(0),
  status: status.default('draft'),
  tags: z.array(z.string().max(60)).max(30).default([]),
  order: z.number().default(0),
  createdAt: time,
  updatedAt: time,
});

const AssetSchema = z.object({
  id,
  lessonId: id,
  kind: z.enum(['image', 'audio', 'video']),
  mime: z.string().max(100),
  name: z.string().max(300).default(''),
  size: z.number().int().min(0),
  width: z.number().optional(),
  height: z.number().optional(),
  createdAt: time,
  path: z.string().regex(/^assets\/[^/]+$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

const WithId = z.object({ id }).passthrough();
const DocShape = z.object({ lessonId: id }).passthrough();
const AttemptShape = z
  .object({
    id,
    quizId: id,
    studentKey: z.string().max(200),
    studentName: z.string().max(200),
    status: z.enum(['in_progress', 'submitted']),
    preview: z.boolean().default(false),
    quiz: z.object({ id, questions: z.array(z.unknown()) }).passthrough(),
    order: z.array(z.string()),
    answers: z.record(z.unknown()),
    startedAt: time,
  })
  .passthrough();
const ProgressShape = z
  .object({ id, studentKey: z.string().max(200), studentName: z.string().max(200), lessonId: id, projectId: id, visited: z.array(z.string()), updatedAt: time })
  .passthrough();
const SettingShape = z.object({ key: z.string().max(100), value: z.unknown(), updatedAt: time.default(0) });

const DataSchema = z.object({
  projects: z.array(z.unknown()).default([]),
  lessons: z.array(z.unknown()).default([]),
  lessonDocs: z.array(z.unknown()).default([]),
  assets: z.array(z.unknown()).default([]),
  // Tables added in later versions may be missing from older files.
  quizzes: z.array(z.unknown()).default([]),
  attempts: z.array(z.unknown()).default([]),
  progress: z.array(z.unknown()).default([]),
  designs: z.array(z.unknown()).default([]),
  library: z.array(z.unknown()).default([]),
  settings: z.array(z.unknown()).default([]),
});

function parseList<T>(list: unknown[], schema: z.ZodType<T>, what: string): T[] {
  return list.map((x, i) => {
    const r = schema.safeParse(x);
    if (!r.success) {
      const issue = r.error.issues[0];
      throw new TransferError('invalid', `بيانات غير صالحة في الملف (${what} رقم ${i + 1}: ${issue.path.join('.') || 'السجل'}).`);
    }
    return r.data;
  });
}

const unique = <T extends { id: string }>(list: T[], what: string) => {
  const seen = new Set<string>();
  for (const x of list) {
    if (seen.has(x.id)) throw new TransferError('invalid', `بيانات غير صالحة في الملف: ${what} مكرر.`);
    seen.add(x.id);
  }
};

/**
 * Opens and checks an .ibm file completely before anything is written:
 * size, ZIP structure, format and version, every record, links between records,
 * and the SHA-256 of every media file. Throws TransferError with a clear message.
 */
export async function readPackage(bytes: Uint8Array): Promise<Package> {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new TransferError('too-large', `الملف أكبر من الحد المسموح (${Math.round(MAX_FILE_BYTES / 1024 / 1024)} م.ب).`);
  if (bytes.byteLength < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new TransferError('not-zip', 'هذا ليس ملف مشروع أو نسخة احتياطية من IBRAHI8M EDU STUDIO (الملف ليس بصيغة ‎.ibm).');

  let entries: Record<string, Uint8Array>;
  let declared = 0;
  try {
    entries = unzipSync(bytes, {
      filter: (f) => {
        declared += f.originalSize;
        if (declared > MAX_UNPACKED_BYTES) throw new TransferError('too-large', 'محتوى الملف بعد فك ضغطه أكبر من الحد المسموح.');
        return f.name === 'manifest.json' || f.name === 'data.json' || f.name.startsWith('assets/');
      },
    });
  } catch (e) {
    if (e instanceof TransferError) throw e;
    throw new TransferError('corrupt', 'الملف تالف أو غير مكتمل؛ تعذّر فتحه. جرّب نسخة أخرى منه.');
  }

  if (!entries['manifest.json']) throw new TransferError('not-ours', 'هذا الملف المضغوط ليس من IBRAHI8M EDU STUDIO (لا يحتوي على بيان الملف manifest.json).');
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(strFromU8(entries['manifest.json']));
  } catch {
    throw new TransferError('corrupt', 'بيان الملف تالف ولا يمكن قراءته.');
  }
  const m = ManifestSchema.safeParse(manifestRaw);
  if (!m.success || m.data.format !== FORMAT) throw new TransferError('not-ours', 'هذا الملف ليس من IBRAHI8M EDU STUDIO أو بصيغة غير معروفة.');
  const manifest = m.data as Manifest;
  if (manifest.formatVersion > FORMAT_VERSION || manifest.schemaVersion > SCHEMA_VERSION)
    throw new TransferError('newer', `أُنشئ هذا الملف بإصدار أحدث من التطبيق (${manifest.appVersion || 'غير معروف'}). حدّث التطبيق على هذا الجهاز ثم أعد الاستيراد.`);

  const dataBytes = entries['data.json'];
  if (!dataBytes) throw new TransferError('corrupt', 'الملف ناقص: لا يحتوي على البيانات (data.json).');
  if ((await sha256(dataBytes)) !== manifest.dataSha256) throw new TransferError('corrupt', 'الملف تالف: البيانات لا تطابق بصمتها المسجلة فيه. ربما تغيّر الملف بعد تصديره.');
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(dataBytes));
  } catch {
    throw new TransferError('corrupt', 'بيانات الملف تالفة ولا يمكن قراءتها.');
  }
  const top = DataSchema.safeParse(raw);
  if (!top.success) throw new TransferError('invalid', 'بنية البيانات في الملف غير صحيحة.');
  const d = top.data;
  const warnings: string[] = [];

  const projects = parseList(d.projects, ProjectSchema, 'المشروع') as Project[];
  const lessons = parseList(d.lessons, LessonSchema, 'الدرس') as Lesson[];
  const assets = parseList(d.assets, AssetSchema, 'ملف الوسائط') as AssetMeta[];
  const lessonDocs: LessonDoc[] = parseList(d.lessonDocs, DocShape, 'محتوى الدرس').map((x) => normalizeDoc(x, x.lessonId));
  const quizzes: Quiz[] = parseList(d.quizzes, WithId, 'الاختبار').map((x, i) => {
    const q = normalizeQuiz(x);
    if (!q) throw new TransferError('invalid', `بيانات غير صالحة في الملف (الاختبار رقم ${i + 1}).`);
    return q;
  });
  const attempts = parseList(d.attempts, AttemptShape, 'المحاولة') as unknown as Attempt[];
  const progress = parseList(d.progress, ProgressShape, 'تقدم الطالب') as unknown as LessonProgress[];
  const designs: Design[] = parseList(d.designs, WithId, 'التصميم').map((x, i) => {
    const r = normalizeDesign(x);
    if (!r) throw new TransferError('invalid', `بيانات غير صالحة في الملف (التصميم رقم ${i + 1}).`);
    return r;
  });
  const library: LibraryItem[] = parseList(d.library, WithId, 'عنصر المكتبة').map((x, i) => {
    const r = normalizeLibraryItem(x);
    if (!r) throw new TransferError('invalid', `بيانات غير صالحة في الملف (عنصر المكتبة رقم ${i + 1}).`);
    return r;
  });
  const settingsRows = parseList(d.settings, SettingShape, 'الإعداد');
  // Only known settings with valid values are kept.
  const valid = loadSettingsFromRows(settingsRows as SettingRow[]);
  const settings: SettingRow[] = settingsRows.filter((r) => isSettingKey(r.key) && (valid as unknown as Record<string, unknown>)[r.key] === r.value) as SettingRow[];
  if (settings.length < settingsRows.length) warnings.push('بعض الإعدادات في الملف غير معروفة أو غير صالحة، ولن تُستورد.');

  for (const [list, what] of [
    [projects, 'مشروع'],
    [lessons, 'درس'],
    [assets, 'ملف وسائط'],
    [quizzes, 'اختبار'],
    [attempts, 'محاولة'],
    [progress, 'تقدم'],
    [designs, 'تصميم'],
    [library, 'عنصر مكتبة'],
  ] as const)
    unique(list as { id: string }[], what);

  // Links between records
  const projectIds = new Set(projects.map((p) => p.id));
  const lessonIds = new Set(lessons.map((l) => l.id));
  const quizIds = new Set(quizzes.map((q) => q.id));
  if (manifest.kind === 'project' && projects.length !== 1) throw new TransferError('invalid', 'ملف المشروع يجب أن يحتوي على مشروع واحد.');
  if (!projects.length && !library.length && !settings.length) throw new TransferError('empty', 'الملف لا يحتوي على أي بيانات لاستيرادها.');
  for (const l of lessons) if (!projectIds.has(l.projectId)) throw new TransferError('invalid', `الدرس «${l.title}» ينتمي إلى مشروع غير موجود في الملف.`);
  for (const doc of lessonDocs) if (!lessonIds.has(doc.lessonId)) throw new TransferError('invalid', 'محتوى درس في الملف لا ينتمي إلى أي درس فيه.');
  for (const q of quizzes) if (!projectIds.has(q.projectId)) throw new TransferError('invalid', `الاختبار «${q.title}» ينتمي إلى مشروع غير موجود في الملف.`);
  for (const a of attempts) if (!quizIds.has(a.quizId)) throw new TransferError('invalid', 'محاولة طالب في الملف تخص اختبارًا غير موجود فيه.');
  for (const p of progress) if (!lessonIds.has(p.lessonId) || !projectIds.has(p.projectId)) throw new TransferError('invalid', 'تقدم طالب في الملف يخص درسًا غير موجود فيه.');
  for (const x of designs) if (!projectIds.has(x.projectId)) throw new TransferError('invalid', `التصميم «${x.title}» ينتمي إلى مشروع غير موجود في الملف.`);
  for (const a of assets) if (!lessonIds.has(a.lessonId) && a.lessonId !== LIBRARY_OWNER) throw new TransferError('invalid', `ملف الوسائط «${a.name}» لا ينتمي إلى أي درس في الملف.`);
  // A quiz linked to a lesson that is not in the file keeps working without that link.
  for (const q of quizzes) if (q.lessonId && !lessonIds.has(q.lessonId)) q.lessonId = null;
  for (const x of designs) if (x.lessonId && !lessonIds.has(x.lessonId)) x.lessonId = null;

  // Every media file present and identical to what was exported
  const files = new Map<string, Uint8Array>();
  for (const a of assets) {
    const b = entries[a.path];
    if (!b) throw new TransferError('corrupt', `الملف ناقص: ملف الوسائط «${a.name}» غير موجود فيه.`);
    if (b.byteLength !== a.size || (await sha256(b)) !== a.sha256) throw new TransferError('corrupt', `الملف تالف: ملف الوسائط «${a.name}» لا يطابق بصمته المسجلة.`);
    files.set(a.id, b);
  }
  const assetIds = new Set(assets.map((a) => a.id));
  const missing = lessonDocs.flatMap((doc) => doc.blocks.flatMap((b) => ('assetId' in b && b.assetId && !assetIds.has(b.assetId) ? [b.assetId] : [])));
  if (missing.length) warnings.push(`${missing.length === 1 ? 'ملف وسائط واحد مشار إليه' : `${missing.length} ملفات وسائط مشار إليها`} في الدروس غير موجود في الملف؛ سيظهر مكانه «غير موجود على هذا الجهاز».`);
  if (manifest.schemaVersion < SCHEMA_VERSION) warnings.push(`الملف من إصدار أقدم (${manifest.appVersion || `قاعدة بيانات v${manifest.schemaVersion}`})، وقد حُوّلت بياناته إلى الإصدار الحالي.`);

  const data: PackageData = { projects, lessons, lessonDocs, assets, quizzes, attempts, progress, designs, library, settings };
  return { manifest, data, files, warnings };
}
