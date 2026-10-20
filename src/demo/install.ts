/**
 * Installs and removes the demo project.
 *
 * - Installing never touches the teacher's data: it only adds records whose ids start
 *   with "demo-", in one transaction, and does nothing if the demo is already there.
 * - Removing deletes only the demo project (with its lessons, media, quizzes, attempts,
 *   progress and designs) through the same deleteProject() the app uses everywhere.
 * - Students' attempts are graded by the app's own grader, so the results pages show
 *   exactly what real attempts with those answers would show.
 */
import type { EduDB, Lesson, Project } from '../db/db';
import { deleteProject } from '../db/projects';
import { progressId } from '../db/progress';
import type { Asset, LessonDoc } from '../lesson/types';
import { gradeAttempt, parseFill } from '../quiz/grading';
import { newAttempt, normalizeQuiz, studentKey } from '../quiz/model';
import type { Answer, Attempt, Question, Quiz } from '../quiz/types';
import { lessonSections } from '../student/sections';
import type { LessonProgress } from '../student/types';
import { activitySteps, filledCards } from '../lesson/model';
import type { Design } from '../studio/types';
import {
  DEMO_DESIGNS,
  DEMO_LESSONS,
  DEMO_PROJECT,
  DEMO_PROJECT_ID,
  DEMO_QUIZ_SETTINGS,
  DEMO_QUIZZES,
  DEMO_STUDENTS,
  DEMO_VERSION,
  isDemoId,
} from './content';

export const DEMO_META_KEY = 'demo';

export interface DemoImage {
  data: ArrayBuffer;
  width?: number;
  height?: number;
}

/** Loads a picture shipped with the app (public/demo/<file>); null when it cannot be read. */
export type ImageLoader = (file: string) => Promise<DemoImage | null>;

export interface DemoRecords {
  project: Project;
  lessons: Lesson[];
  docs: LessonDoc[];
  assets: Asset[];
  quizzes: Quiz[];
  attempts: Attempt[];
  progress: LessonProgress[];
  designs: Design[];
}

const DAY = 86_400_000;
const MIN = 60_000;

/** Small deterministic random generator: the same demo every time. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One student writes the right term inside a longer sentence; the grader cannot be sure
 * and sends it to the teacher — so the results show the «waiting for review» feature once.
 */
const REVIEW_CASE = { student: 'كريم', question: 'demo-q2-7', text: 'أظن أنها الهندسة الاجتماعية' };

/** Plausible wrong answers for the typed questions. */
const WRONG_TEXT: Record<string, string> = {
  'demo-q1-6': '8',
  'demo-q2-7': 'التلاعب بالمشاعر',
  'demo-q3-6': 'اكتب',
};

type Outcome = 'correct' | 'partial' | 'wrong';

function answerFor(q: Question, outcome: Outcome, rand: () => number): Answer {
  switch (q.type) {
    case 'mcq': {
      const wrong = q.options.filter((o) => !q.correct.includes(o.id));
      if (outcome === 'correct') return { type: 'mcq', selected: q.multiple ? [...q.correct] : [q.correct[0]] };
      if (outcome === 'partial' && q.multiple) return { type: 'mcq', selected: q.correct.slice(0, Math.max(1, q.correct.length - 1)) };
      return { type: 'mcq', selected: [wrong[Math.floor(rand() * wrong.length)].id] };
    }
    case 'truefalse':
      return { type: 'truefalse', value: outcome === 'correct' ? q.answer : !q.answer };
    case 'short':
      return { type: 'short', text: outcome === 'correct' ? q.accepted[0] : (WRONG_TEXT[q.id] ?? 'لا أعرف') };
    case 'matching': {
      const ids = q.pairs.map((p) => p.id);
      const map: Record<string, string> = {};
      if (outcome === 'correct') ids.forEach((id) => (map[id] = id));
      else if (outcome === 'partial') ids.forEach((id, i) => (map[id] = i < 2 ? ids[1 - i] : id));
      else ids.forEach((id, i) => (map[id] = ids[(i + 1) % ids.length]));
      return { type: 'matching', map };
    }
    case 'ordering': {
      const ids = q.items.map((i) => i.id);
      if (outcome === 'correct') return { type: 'ordering', order: ids, touched: true };
      if (outcome === 'partial') return { type: 'ordering', order: [...ids.slice(0, -2), ids[ids.length - 1], ids[ids.length - 2]], touched: true };
      return { type: 'ordering', order: [...ids].reverse(), touched: true };
    }
    case 'fill': {
      const blanks = parseFill(q.text).filter((p) => p.kind === 'blank') as { answers: string[] }[];
      return {
        type: 'fill',
        blanks: blanks.map((b, i) => (outcome === 'correct' || (outcome === 'partial' && i === 0) ? b.answers[0] : 'لا أعرف')),
      };
    }
  }
}

const canBePartial = (q: Question) => q.type === 'matching' || q.type === 'ordering' || q.type === 'fill' || (q.type === 'mcq' && q.multiple);

function outcomeFor(q: Question, skill: number, rand: () => number): Outcome {
  const p = skill - Math.max(0, (q.bloom || 1) - 1) * 0.05;
  const r = rand();
  if (r < p) return 'correct';
  if (canBePartial(q) && r < p + 0.22) return 'partial';
  return 'wrong';
}

function attemptFor(quiz: Quiz, name: string, skill: number, at: number, n: number, rand: () => number, id: string): Attempt {
  const base = newAttempt(quiz, name, false, at, rand);
  const answers: Record<string, Answer> = {};
  for (const q of quiz.questions) answers[q.id] = answerFor(q, outcomeFor(q, skill, rand), rand);
  if (name === REVIEW_CASE.student && n === 0 && answers[REVIEW_CASE.question]) answers[REVIEW_CASE.question] = { type: 'short', text: REVIEW_CASE.text };
  const submittedAt = at + (6 + Math.floor(rand() * 9)) * MIN;
  return {
    ...base,
    id,
    answers,
    status: 'submitted',
    submittedAt,
    result: gradeAttempt(quiz.questions, answers, quiz.settings.passPercent),
    // a few students flag a question to come back to
    flagged: n === 0 && rand() < 0.2 ? [quiz.questions[quiz.questions.length - 1].id] : [],
  };
}

/** Builds every demo record in memory (pure; no database). `images` maps file name → picture. */
export function buildDemo(now: number, images: Map<string, DemoImage>): DemoRecords {
  const start = now - 14 * DAY;
  const project: Project = { ...DEMO_PROJECT, tags: [...DEMO_PROJECT.tags], status: 'ready', createdAt: start, updatedAt: now };

  const lessons: Lesson[] = [];
  const docs: LessonDoc[] = [];
  const assets: Asset[] = [];
  DEMO_LESSONS.forEach((l, i) => {
    const created = start + i * DAY;
    lessons.push({ id: l.id, projectId: DEMO_PROJECT_ID, title: l.title, summary: l.summary, duration: l.duration, status: 'ready', tags: [], order: i, createdAt: created, updatedAt: created + 2 * 3600_000 });
    const pic = images.get(l.image.file);
    if (pic) {
      assets.push({ id: l.image.assetId, lessonId: l.id, kind: 'image', mime: 'image/png', name: l.image.name, size: pic.data.byteLength, width: pic.width, height: pic.height, data: pic.data, createdAt: created });
    }
    // Without its picture (should never happen offline: it is part of the app) the lesson simply has no image block.
    const blocks = pic ? l.doc.blocks : l.doc.blocks.filter((b) => !(b.type === 'image' && b.assetId === l.image.assetId));
    docs.push({ ...structuredClone(l.doc), blocks: structuredClone(blocks), lessonId: l.id, schema: 1, rev: 1, updatedAt: created + 2 * 3600_000 });
  });

  const quizzes: Quiz[] = DEMO_QUIZZES.map((q, i) => {
    const created = start + (i + 1) * DAY;
    const quiz = normalizeQuiz({ id: q.id, projectId: DEMO_PROJECT_ID, lessonId: q.lessonId, title: q.title, description: q.description, settings: { ...DEMO_QUIZ_SETTINGS }, questions: structuredClone(q.questions), rev: 1, createdAt: created, updatedAt: created });
    if (!quiz) throw new Error(`demo quiz ${q.id} is invalid`);
    return quiz;
  });

  // Attempts: quiz k was taken (12 - 4k) days ago, one student every few minutes.
  const rand = seeded(20261020);
  const attempts: Attempt[] = [];
  DEMO_STUDENTS.forEach((s, si) => {
    quizzes.forEach((quiz, qi) => {
      if (qi >= s.quizzes) return;
      const at = now - (12 - qi * 4) * DAY + 10 * 3600_000 + si * 7 * MIN;
      const first = attemptFor(quiz, s.name, s.skill, at, 0, rand, `demo-att-${qi + 1}-${si + 1}-1`);
      attempts.push(first);
      // Students who did not pass try once more the next day, after reviewing.
      if (first.result && !first.result.passed) {
        attempts.push(attemptFor(quiz, s.name, Math.min(0.97, s.skill + 0.25), at + DAY, 1, rand, `demo-att-${qi + 1}-${si + 1}-2`));
      }
    });
  });

  // Progress in the lessons: a student who took a lesson's quiz finished the lesson first.
  const progress: LessonProgress[] = [];
  DEMO_STUDENTS.forEach((s, si) => {
    docs.forEach((doc, li) => {
      const sections = lessonSections(doc);
      const done = li < s.quizzes;
      const seen = done ? sections : sections.slice(0, Math.max(1, Math.ceil(sections.length / 2)));
      const activities: Record<string, number[]> = {};
      const cardsSeen: Record<string, string[]> = {};
      for (const b of doc.blocks) {
        if (b.type === 'activity') {
          const steps = activitySteps(b).map((_, i) => i);
          activities[b.id] = done ? steps.filter(() => rand() < 0.4 + s.skill * 0.6) : [];
        }
        if (b.type === 'cards') cardsSeen[b.id] = filledCards(b).filter(() => rand() < (done ? 0.5 + s.skill / 2 : 0.3)).map((c) => c.id);
      }
      const startedAt = now - (13 - li * 4) * DAY + 9 * 3600_000 + si * 5 * MIN;
      progress.push({
        id: progressId(s.name, doc.lessonId),
        studentKey: studentKey(s.name),
        studentName: s.name,
        lessonId: doc.lessonId,
        projectId: DEMO_PROJECT_ID,
        visited: seen.map((x) => x.id),
        sections: sections.length,
        current: done ? 'end' : seen[seen.length - 1].id,
        activities,
        cards: cardsSeen,
        startedAt,
        updatedAt: startedAt + 40 * MIN,
        completedAt: done ? startedAt + 40 * MIN : null,
      });
    });
  });

  const designs: Design[] = DEMO_DESIGNS.map((d, i) => ({ ...structuredClone(d), rev: 1, createdAt: start + (5 + i) * DAY, updatedAt: start + (5 + i) * DAY } as Design));

  return { project, lessons, docs, assets, quizzes, attempts, progress, designs };
}

export interface DemoInfo {
  version: number;
  installedAt: number;
}

export type InstallResult = { status: 'installed'; records: DemoRecords } | { status: 'exists' };

/** Adds the demo project. Does nothing (and changes nothing) if it is already on this device. */
export async function installDemo(database: EduDB, loadImage: ImageLoader, now = Date.now()): Promise<InstallResult> {
  if (await database.projects.get(DEMO_PROJECT_ID)) return { status: 'exists' };
  const images = new Map<string, DemoImage>();
  for (const l of DEMO_LESSONS) {
    const pic = await loadImage(l.image.file).catch(() => null);
    if (pic) images.set(l.image.file, pic);
  }
  const r = buildDemo(now, images);
  const tables = [database.projects, database.lessons, database.lessonDocs, database.assets, database.quizzes, database.attempts, database.progress, database.designs, database.meta];
  return database.transaction('rw', tables, async () => {
    // Checked again inside the transaction: two windows clicking at once still add it once.
    if (await database.projects.get(DEMO_PROJECT_ID)) return { status: 'exists' } as const;
    await database.projects.add(r.project);
    await database.lessons.bulkAdd(r.lessons);
    await database.lessonDocs.bulkAdd(r.docs);
    if (r.assets.length) await database.assets.bulkAdd(r.assets);
    await database.quizzes.bulkAdd(r.quizzes);
    await database.attempts.bulkAdd(r.attempts);
    await database.progress.bulkPut(r.progress);
    await database.designs.bulkAdd(r.designs);
    await database.meta.put({ key: DEMO_META_KEY, value: { version: DEMO_VERSION, installedAt: now } satisfies DemoInfo });
    return { status: 'installed', records: r } as const;
  });
}

/**
 * Removes the demo project and everything inside it — including anything the teacher
 * added inside it — and nothing else. Returns false if there was nothing to remove.
 */
export async function removeDemo(database: EduDB): Promise<boolean> {
  const ids = (await database.projects.toCollection().primaryKeys()).filter((id) => isDemoId(String(id))) as string[];
  for (const id of ids) await deleteProject(database, id);
  await database.meta.delete(DEMO_META_KEY);
  return ids.length > 0;
}

/** Puts the demo back as it was first installed (anything changed inside it is lost). */
export async function resetDemo(database: EduDB, loadImage: ImageLoader, now = Date.now()): Promise<InstallResult> {
  await removeDemo(database);
  return installDemo(database, loadImage, now);
}

/** Reads a demo picture shipped with the app. Works offline: the service worker keeps it. */
export const fetchDemoImage: ImageLoader = async (file) => {
  const res = await fetch(`${import.meta.env.BASE_URL}demo/${file}`);
  if (!res.ok) return null;
  const blob = await res.blob();
  const data = await blob.arrayBuffer();
  let width: number | undefined;
  let height: number | undefined;
  try {
    const bmp = await createImageBitmap(blob);
    width = bmp.width;
    height = bmp.height;
    bmp.close();
  } catch {
    /* size is optional */
  }
  return { data, width, height };
};
