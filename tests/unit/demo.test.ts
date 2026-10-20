import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EduDB } from '../../src/db/db';
import { createLesson, createProject } from '../../src/db/projects';
import { createQuiz, startAttempt, submitAttempt } from '../../src/db/quizzes';
import { DEMO_LESSONS, DEMO_PROJECT_ID, DEMO_QUIZZES, DEMO_STUDENTS, isDemoId } from '../../src/demo/content';
import { buildDemo, DEMO_META_KEY, installDemo, removeDemo, resetDemo, type ImageLoader } from '../../src/demo/install';
import { checkObjective } from '../../src/lesson/bloom';
import { alignment, normalizeDoc } from '../../src/lesson/model';
import { countedAttempt, objectiveStats, quizSummary, studentQuizRows, studentSummaries } from '../../src/quiz/analytics';
import { gradeAttempt } from '../../src/quiz/grading';
import { normalizeQuiz, quizReadiness } from '../../src/quiz/model';
import { normalizeDesign } from '../../src/studio/model';
import { lessonSections, summarizeProgress } from '../../src/student/sections';
import { applyImport, planImport } from '../../src/transfer/apply';
import { buildPackage, collectProject } from '../../src/transfer/pack';
import { readPackage } from '../../src/transfer/read';

const fresh = () => new EduDB(`demo-${Math.random()}`);
const NOW = Date.UTC(2026, 9, 20, 9, 0, 0);

/** The real pictures shipped in public/demo, read from disk (the app fetches the same files). */
const diskImages: ImageLoader = async (file) => {
  const buf = readFileSync(new URL(`../../public/demo/${file}`, import.meta.url));
  return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};

async function everything(d: EduDB) {
  return {
    projects: await d.projects.toArray(),
    lessons: await d.lessons.toArray(),
    docs: await d.lessonDocs.toArray(),
    assets: await d.assets.toArray(),
    quizzes: await d.quizzes.toArray(),
    attempts: await d.attempts.toArray(),
    progress: await d.progress.toArray(),
    designs: await d.designs.toArray(),
    library: await d.library.toArray(),
  };
}

/** The teacher's own project, made through the normal functions. */
async function teacherData(d: EduDB) {
  const p = await createProject(d, { title: 'مشروعي', subject: 'العلوم' });
  const l = await createLesson(d, p.id, { title: 'درسي' });
  const q = await createQuiz(d, p.id, l.id, 'اختباري');
  const a = await startAttempt(d, q.id, 'سارة'); // same name as a demo student, on purpose
  await submitAttempt(d, a.id, { answers: {} });
  return { p, l, q };
}

describe('demo project content (the plan: 3 lessons, ≥3 objectives each, an activity, a quiz covering the question types, 10 students)', () => {
  const r = buildDemo(NOW, new Map());

  it('has three complete lessons, each with at least three well-formed objectives fully aligned with content and practice', () => {
    expect(r.lessons).toHaveLength(3);
    for (const doc of r.docs) {
      const n = normalizeDoc(doc, doc.lessonId);
      expect(n).toEqual(doc); // already in the app's own shape: nothing is dropped or fixed when read
      expect(doc.objectives.length).toBeGreaterThanOrEqual(3);
      for (const o of doc.objectives) expect(checkObjective(o).level, `${o.verb} ${o.content}`).toBe('ok');
      expect(doc.blocks.some((b) => b.type === 'activity')).toBe(true);
      const al = alignment(doc);
      expect(al.uncovered).toBe(0);
      expect(al.partial).toBe(0);
      expect(al.unlinkedBlockIds).toEqual([]);
      expect(doc.strategies.length).toBeGreaterThan(0);
      expect(doc.strategyNotes.length).toBeGreaterThan(80); // the «why» on the pedagogical decision card
    }
    // Bloom levels across the unit reach from remembering to creating
    const levels = new Set(r.docs.flatMap((d) => d.objectives.map((o) => o.level)));
    expect([...levels].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('has one quiz per lesson; each covers the four core types (and all six together), every question linked to an objective of its lesson', () => {
    expect(r.quizzes).toHaveLength(3);
    for (const q of r.quizzes) {
      expect(normalizeQuiz(q)).toEqual(q);
      expect(quizReadiness(q).ready).toBe(true);
      const types = new Set(q.questions.map((x) => x.type));
      for (const t of ['mcq', 'truefalse', 'short', 'matching']) expect(types.has(t as never), `${q.title}: ${t}`).toBe(true);
      const objectiveIds = new Set(r.docs.find((d) => d.lessonId === q.lessonId)!.objectives.map((o) => o.id));
      for (const x of q.questions) {
        expect(x.objectiveIds.length).toBeGreaterThan(0);
        for (const id of x.objectiveIds) expect(objectiveIds.has(id)).toBe(true);
        expect(x.feedbackIncorrect.length).toBeGreaterThan(0);
        if (x.type === 'mcq') for (const o of x.options) if (!x.correct.includes(o.id)) expect(o.feedback, `${x.id}/${o.id}`).not.toBe('');
      }
    }
    expect(new Set(r.quizzes.flatMap((q) => q.questions.map((x) => x.type)))).toEqual(new Set(['mcq', 'truefalse', 'short', 'matching', 'ordering', 'fill']));
  });

  it('ten students with submitted attempts graded by the app’s own grader; results are varied and realistic', () => {
    const names = new Set(r.attempts.map((a) => a.studentName));
    expect(names.size).toBe(10);
    expect(r.attempts.length).toBeGreaterThanOrEqual(10);
    for (const a of r.attempts) {
      expect(a.status).toBe('submitted');
      expect(a.preview).toBe(false);
      expect(a.submittedAt! > a.startedAt).toBe(true);
      expect(a.submittedAt! < NOW).toBe(true);
      // the stored result is exactly what grading these answers gives
      expect(a.result).toEqual(gradeAttempt(a.quiz.questions, a.answers, a.quiz.settings.passPercent));
    }
    const rows = studentQuizRows(r.attempts, () => 'best');
    const students = studentSummaries(rows);
    expect(students).toHaveLength(10);
    const percents = rows.map((x) => countedAttempt(r.attempts.filter((a) => a.quizId === x.quizId && a.studentKey === x.studentKey), 'best')!.result!.percent);
    expect(Math.max(...percents)).toBeGreaterThanOrEqual(90);
    expect(Math.min(...percents)).toBeLessThan(60);
    // some retakes, some not passed at all, one answer waiting for the teacher
    expect(r.attempts.some((a) => a.id.endsWith('-2'))).toBe(true);
    // exactly one answer waits for the teacher (the review feature, shown once)
    expect(r.attempts.reduce((n, a) => n + (a.result?.pendingReview ?? 0), 0)).toBe(1);
    for (const q of r.quizzes) {
      const s = quizSummary(r.attempts.filter((a) => a.quizId === q.id));
      expect(s.students).toBe(DEMO_STUDENTS.filter((st) => st.quizzes > r.quizzes.indexOf(q)).length);
      expect(objectiveStats(r.attempts.filter((a) => a.quizId === q.id)).length).toBeGreaterThan(0);
    }
  });

  it('the same demo every time (deterministic), and student progress matches the lessons', () => {
    const again = buildDemo(NOW, new Map());
    expect(again.attempts.map((a) => [a.id, a.result?.percent])).toEqual(r.attempts.map((a) => [a.id, a.result?.percent]));
    for (const p of r.progress) {
      const doc = r.docs.find((d) => d.lessonId === p.lessonId)!;
      const s = summarizeProgress(doc, p);
      expect(p.sections).toBe(lessonSections(doc).length);
      expect(s.completed).toBe(p.completedAt !== null);
    }
    expect(r.progress.filter((p) => p.completedAt).length).toBeGreaterThan(20);
    expect(r.progress.filter((p) => !p.completedAt).length).toBeGreaterThan(0);
  });

  it('three designs in the app’s own shape, every record id marked as demo', () => {
    expect(r.designs.map((d) => d.kind).sort()).toEqual(['cards', 'conceptmap', 'summary']);
    for (const d of r.designs) expect(normalizeDesign(d)).toEqual(d);
    const all = [r.project, ...r.lessons, ...r.quizzes, ...r.attempts, ...r.designs];
    for (const x of all) expect(isDemoId(x.id), x.id).toBe(true);
    expect(DEMO_LESSONS.length).toBe(3);
    expect(DEMO_QUIZZES.length).toBe(3);
  });
});

describe('installing and removing the demo never touches the teacher’s data', () => {
  it('installs into a device that already has data; everything already there is byte-for-byte the same', async () => {
    const d = fresh();
    await teacherData(d);
    const before = await everything(d);
    const res = await installDemo(d, diskImages, NOW);
    expect(res.status).toBe('installed');
    const after = await everything(d);
    for (const k of Object.keys(before) as (keyof typeof before)[]) {
      const mine = (after[k] as { id?: string; lessonId?: string; projectId?: string; quizId?: string }[]).filter(
        (x) => !isDemoId(x.id) && !isDemoId(x.lessonId) && !isDemoId(x.projectId) && !isDemoId(x.quizId),
      );
      expect(mine, k).toEqual(before[k]);
    }
    expect(after.projects).toHaveLength(2);
    expect(after.lessons.filter((l) => l.projectId === DEMO_PROJECT_ID)).toHaveLength(3);
    expect(after.assets.filter((a) => isDemoId(a.id))).toHaveLength(3);
    expect(after.assets.find((a) => a.id === 'demo-asset-1')!.width).toBe(960);
    expect((await d.meta.get(DEMO_META_KEY))?.value).toMatchObject({ version: 1, installedAt: NOW });
  });

  it('installing twice adds nothing (even two at the same time)', async () => {
    const d = fresh();
    await installDemo(d, diskImages, NOW);
    const once = await everything(d);
    const [a, b] = await Promise.all([installDemo(d, diskImages, NOW + 5), installDemo(d, diskImages, NOW + 9)]);
    expect([a.status, b.status]).toEqual(['exists', 'exists']);
    expect(await everything(d)).toEqual(once);
  });

  it('removing deletes the demo and everything added inside it, and nothing else', async () => {
    const d = fresh();
    const { p } = await teacherData(d);
    const before = await everything(d);
    await installDemo(d, diskImages, NOW);
    // the teacher adds a lesson inside the demo project
    await createLesson(d, DEMO_PROJECT_ID, { title: 'درس أضفته للمشروع التجريبي' });
    expect(await removeDemo(d)).toBe(true);
    expect(await everything(d)).toEqual(before);
    expect(await d.meta.get(DEMO_META_KEY)).toBeUndefined();
    expect((await d.projects.get(p.id))?.title).toBe('مشروعي');
    expect(await removeDemo(d)).toBe(false); // nothing left to remove
  });

  it('reset puts the demo back as first installed', async () => {
    const d = fresh();
    await installDemo(d, diskImages, NOW);
    const original = await everything(d);
    await d.lessons.update('demo-lesson-1', { title: 'عنوان عدّلته' });
    await d.attempts.delete('demo-att-1-1-1');
    await resetDemo(d, diskImages, NOW);
    expect(await everything(d)).toEqual(original);
  });

  it('works without its pictures: lessons simply have no image block', async () => {
    const d = fresh();
    await installDemo(d, async () => null, NOW);
    expect(await d.assets.count()).toBe(0);
    for (const doc of await d.lessonDocs.toArray()) expect(doc.blocks.some((b) => b.type === 'image')).toBe(false);
  });

  it('the demo project exports to an .ibm file and imports into another device unchanged', async () => {
    const a = fresh();
    await installDemo(a, diskImages, NOW);
    const pkgBytes = (await buildPackage(await collectProject(a, DEMO_PROJECT_ID, { includeResults: true }), 'project', { title: 'وحدة الأمن الرقمي', appVersion: 'test', includesResults: true })).bytes;
    const b = fresh();
    const pkg = await readPackage(pkgBytes);
    expect(pkg.warnings).toEqual([]);
    await applyImport(b, pkg, await planImport(b, pkg));
    const x = await everything(a);
    const y = await everything(b);
    expect(y.lessons).toEqual(x.lessons);
    expect(y.docs).toEqual(x.docs);
    expect(y.quizzes).toEqual(x.quizzes);
    expect(y.attempts).toEqual(x.attempts);
    expect(y.progress).toEqual(x.progress);
    expect(y.designs).toEqual(x.designs);
    expect(y.assets.map((s) => [s.id, s.size])).toEqual(x.assets.map((s) => [s.id, s.size]));
  });
});
