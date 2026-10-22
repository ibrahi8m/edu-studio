import { assertActsAs, assertCanReview } from '../auth/access';
import type { EduDB, Lesson } from '../db/db';
import { newId } from '../db/ids';
import { studentKey } from '../quiz/model';
import type { LearnerProfile, LearnerType, Submission, SubmissionFile } from './types';

export const LEARNER_TYPES: LearnerType[] = ['school', 'university', 'trainee'];
export const SUBMISSION_LIMITS = { answer: 20000, files: 5, fileBytes: 15 * 1024 * 1024, feedback: 3000 };

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** Accepts old or partial records and fills the gaps (used on read and on import). */
export function normalizeLearner(raw: unknown): LearnerProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<LearnerProfile>;
  const name = clip(r.name, 80);
  const key = studentKey(name);
  if (!key) return null;
  const now = Date.now();
  return {
    key,
    name,
    type: LEARNER_TYPES.includes(r.type as LearnerType) ? (r.type as LearnerType) : 'school',
    learnerId: clip(r.learnerId, 60),
    grade: clip(r.grade, 120),
    specialization: clip(r.specialization, 160),
    level: clip(r.level, 120),
    assigned: Array.isArray(r.assigned) ? r.assigned.filter((x): x is string => typeof x === 'string').slice(0, 500) : [],
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
  };
}

export async function getLearner(database: EduDB, name: string): Promise<LearnerProfile | null> {
  const key = studentKey(name);
  if (!key) return null;
  const row = await database.learners.get(key);
  return row ? normalizeLearner(row) : null;
}

export async function saveLearner(database: EduDB, input: Partial<LearnerProfile> & { name: string }): Promise<LearnerProfile> {
  const key = studentKey(input.name);
  if (!key) throw new Error('اكتب الاسم أولًا.');
  return database.transaction('rw', database.learners, async () => {
    const cur = await database.learners.get(key);
    const next = normalizeLearner({ ...cur, ...input, key, createdAt: cur?.createdAt, updatedAt: Date.now() });
    if (!next) throw new Error('بيانات المتعلم غير صالحة.');
    await database.learners.put(next);
    return next;
  });
}

export const submissionId = (name: string, lessonId: string, blockId: string) => `${studentKey(name)}|${lessonId}|${blockId}`;

export async function getSubmission(database: EduDB, name: string, lessonId: string, blockId: string): Promise<Submission | null> {
  return (await database.submissions.get(submissionId(name, lessonId, blockId))) ?? null;
}

export class SubmissionLockedError extends Error {}

/**
 * Saves the learner's answer on this device. `submit` marks it as handed in (still on this device:
 * the teacher sees it in «النتائج» on the same device, or after the data is exported and imported).
 */
export async function saveSubmission(
  database: EduDB,
  name: string,
  lesson: Pick<Lesson, 'id' | 'projectId'>,
  block: { id: string; title: string },
  patch: { answer?: string; files?: SubmissionFile[]; submit?: boolean },
): Promise<Submission> {
  const key = studentKey(name);
  if (!key) throw new Error('اكتب اسم المتعلم أولًا.');
  assertActsAs(name); // 1.6.0: a student hands in only under their own profile
  return database.transaction('rw', database.submissions, async () => {
    const id = submissionId(name, lesson.id, block.id);
    const now = Date.now();
    const cur = await database.submissions.get(id);
    if (cur && cur.status !== 'draft') throw new SubmissionLockedError(cur.status === 'graded' ? 'قُيّم هذا التكليف، ولا يمكن تعديله.' : 'سُلّم هذا التكليف. اسحب التسليم أولًا لتعديله.');
    const answer = patch.answer !== undefined ? patch.answer.slice(0, SUBMISSION_LIMITS.answer) : (cur?.answer ?? '');
    const files = (patch.files ?? cur?.files ?? []).slice(0, SUBMISSION_LIMITS.files);
    if (patch.submit && !answer.trim() && !files.length) throw new Error('اكتب إجابتك أو أرفق ملفًا قبل التسليم.');
    const next: Submission = {
      id,
      studentKey: key,
      studentName: name.trim().slice(0, 80),
      projectId: lesson.projectId,
      lessonId: lesson.id,
      blockId: block.id,
      title: block.title.slice(0, 300),
      answer,
      files,
      status: patch.submit ? 'submitted' : 'draft',
      createdAt: cur?.createdAt ?? now,
      updatedAt: now,
      submittedAt: patch.submit ? now : null,
      score: null,
      feedback: '',
      gradedAt: null,
    };
    await database.submissions.put(next);
    return next;
  });
}

/** Takes a submission back to draft so the learner can change it (not once it has been graded). */
export async function withdrawSubmission(database: EduDB, id: string): Promise<void> {
  const first = await database.submissions.get(id);
  if (first) assertActsAs(first.studentName); // 1.6.0
  await database.transaction('rw', database.submissions, async () => {
    const cur = await database.submissions.get(id);
    if (!cur) return;
    if (cur.status === 'graded') throw new SubmissionLockedError('قُيّم هذا التكليف، ولا يمكن سحبه.');
    await database.submissions.put({ ...cur, status: 'draft', submittedAt: null, updatedAt: Date.now() });
  });
}

/** The teacher's evaluation. `score` null with empty feedback returns it to «تم التسليم». */
export async function gradeSubmission(database: EduDB, id: string, score: number | null, feedback: string): Promise<Submission> {
  const first = await database.submissions.get(id);
  if (first) assertCanReview(await database.projects.get(first.projectId)); // 1.6.0: admin or the content's teacher
  return database.transaction('rw', database.submissions, async () => {
    const cur = await database.submissions.get(id);
    if (!cur) throw new Error('التسليم غير موجود.');
    if (cur.status === 'draft') throw new Error('لم يُسلَّم هذا التكليف بعد.');
    const s = score === null || Number.isNaN(score) ? null : Math.max(0, Math.min(100, Math.round(score)));
    const fb = feedback.trim().slice(0, SUBMISSION_LIMITS.feedback);
    const graded = s !== null || fb.length > 0;
    const next: Submission = { ...cur, score: s, feedback: fb, status: graded ? 'graded' : 'submitted', gradedAt: graded ? Date.now() : null, updatedAt: Date.now() };
    await database.submissions.put(next);
    return next;
  });
}

export function newSubmissionFile(name: string, mime: string, data: ArrayBuffer): SubmissionFile {
  return { id: newId(), name: name.slice(0, 200), mime: mime || 'application/octet-stream', size: data.byteLength, data };
}
