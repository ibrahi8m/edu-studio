import type { Asset, LessonDoc } from '../lesson/types';
import type { Attempt, Quiz } from '../quiz/types';
import type { LessonProgress } from '../student/types';
import type { EduDB, ItemStatus, Lesson, Project, ProjectColor } from './db';
import { GRADES, LIMITS, STATUSES } from './catalog';
import { newId } from './ids';
import { matchesQuery, normalizeArabic } from './search';

/* ───────── ids & input cleaning ───────── */

export { newId };

export function cleanTags(input: string[] | string): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[,،\n]/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of parts) {
    const t = raw.replace(/^#/, '').trim().slice(0, LIMITS.tag);
    const key = normalizeArabic(t);
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= LIMITS.tags) break;
  }
  return out;
}

export interface ProjectInput {
  title: string;
  subject?: string;
  grade?: string;
  description?: string;
  status?: ItemStatus;
  tags?: string[] | string;
  color?: ProjectColor;
}

export interface LessonInput {
  title: string;
  summary?: string;
  duration?: number;
  status?: ItemStatus;
  tags?: string[] | string;
}

export type FieldErrors = Partial<Record<'title' | 'subject' | 'grade' | 'description' | 'summary' | 'duration' | 'status', string>>;

export class ValidationError extends Error {
  constructor(public fields: FieldErrors) {
    super(Object.values(fields).join(' · '));
  }
}

const COLORS: ProjectColor[] = ['blue', 'silver', 'teal', 'violet', 'amber'];

export function validateProject(input: ProjectInput): FieldErrors {
  const e: FieldErrors = {};
  const title = (input.title ?? '').trim();
  if (!title) e.title = 'عنوان المشروع مطلوب.';
  else if (title.length > LIMITS.title) e.title = `العنوان أطول من ${LIMITS.title} حرفًا.`;
  if ((input.subject ?? '').trim().length > LIMITS.subject) e.subject = `اسم المادة أطول من ${LIMITS.subject} حرفًا.`;
  if (input.grade && !GRADES.includes(input.grade)) e.grade = 'اختر المرحلة من القائمة.';
  if ((input.description ?? '').length > LIMITS.description) e.description = `الوصف أطول من ${LIMITS.description} حرف.`;
  if (input.status && !STATUSES.includes(input.status)) e.status = 'حالة غير معروفة.';
  return e;
}

export function validateLesson(input: LessonInput): FieldErrors {
  const e: FieldErrors = {};
  const title = (input.title ?? '').trim();
  if (!title) e.title = 'عنوان الدرس مطلوب.';
  else if (title.length > LIMITS.title) e.title = `العنوان أطول من ${LIMITS.title} حرفًا.`;
  if ((input.summary ?? '').length > LIMITS.summary) e.summary = `الملخص أطول من ${LIMITS.summary} حرف.`;
  const d = input.duration ?? 0;
  if (!Number.isFinite(d) || d < 0 || d > LIMITS.duration || !Number.isInteger(d))
    e.duration = `المدة رقم صحيح بين 0 و${LIMITS.duration} دقيقة.`;
  if (input.status && !STATUSES.includes(input.status)) e.status = 'حالة غير معروفة.';
  return e;
}

function assertValid(errors: FieldErrors) {
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

/* ───────── projects ───────── */

export async function createProject(database: EduDB, input: ProjectInput): Promise<Project> {
  assertValid(validateProject(input));
  const now = Date.now();
  const project: Project = {
    id: newId(),
    title: input.title.trim(),
    subject: (input.subject ?? '').trim(),
    grade: input.grade ?? '',
    description: (input.description ?? '').trim(),
    status: input.status ?? 'draft',
    tags: cleanTags(input.tags ?? []),
    color: input.color && COLORS.includes(input.color) ? input.color : 'blue',
    createdAt: now,
    updatedAt: now,
  };
  await database.projects.add(project);
  return project;
}

export async function updateProject(database: EduDB, id: string, patch: Partial<ProjectInput>): Promise<Project> {
  return database.transaction('rw', database.projects, async () => {
    const current = await database.projects.get(id);
    if (!current) throw new Error('المشروع غير موجود.');
    const merged: ProjectInput = { ...current, ...patch, title: patch.title ?? current.title };
    assertValid(validateProject(merged));
    const next: Project = {
      ...current,
      title: merged.title.trim(),
      subject: (merged.subject ?? '').trim(),
      grade: merged.grade ?? '',
      description: (merged.description ?? '').trim(),
      status: merged.status ?? current.status,
      tags: cleanTags(merged.tags ?? []),
      color: merged.color && COLORS.includes(merged.color) ? merged.color : current.color,
      updatedAt: Math.max(Date.now(), current.updatedAt + 1),
    };
    await database.projects.put(next);
    return next;
  });
}

export interface ProjectSnapshot {
  project: Project;
  lessons: Lesson[];
  docs: LessonDoc[];
  assets: Asset[];
  quizzes?: Quiz[];
  attempts?: Attempt[];
  progress?: LessonProgress[];
}

/** Deletes a project with its lessons, their content and media, its quizzes and their attempts, atomically; returns what was removed so it can be restored. */
export async function deleteProject(database: EduDB, id: string): Promise<ProjectSnapshot> {
  return database.transaction('rw', [database.projects, database.lessons, database.lessonDocs, database.assets, database.quizzes, database.attempts, database.progress], async () => {
    const project = await database.projects.get(id);
    if (!project) throw new Error('المشروع غير موجود.');
    const lessons = await database.lessons.where('projectId').equals(id).toArray();
    const ids = lessons.map((l) => l.id);
    const docs = (await database.lessonDocs.bulkGet(ids)).filter((d): d is LessonDoc => !!d);
    const assets = ids.length ? await database.assets.where('lessonId').anyOf(ids).toArray() : [];
    if (ids.length) {
      await database.assets.where('lessonId').anyOf(ids).delete();
      await database.lessonDocs.bulkDelete(ids);
    }
    const quizzes = await database.quizzes.where('projectId').equals(id).toArray();
    const quizIds = quizzes.map((q) => q.id);
    const attempts = quizIds.length ? await database.attempts.where('quizId').anyOf(quizIds).toArray() : [];
    if (quizIds.length) {
      await database.attempts.where('quizId').anyOf(quizIds).delete();
      await database.quizzes.bulkDelete(quizIds);
    }
    await database.lessons.where('projectId').equals(id).delete();
    await database.projects.delete(id);
    const progress = await database.progress.where('projectId').equals(id).toArray();
    await database.progress.where('projectId').equals(id).delete();
    return { project, lessons, docs, assets, quizzes, attempts, progress };
  });
}

export async function restoreProject(database: EduDB, snap: ProjectSnapshot): Promise<void> {
  await database.transaction('rw', [database.projects, database.lessons, database.lessonDocs, database.assets, database.quizzes, database.attempts, database.progress], async () => {
    await database.projects.put(snap.project);
    if (snap.lessons.length) await database.lessons.bulkPut(snap.lessons);
    if (snap.docs?.length) await database.lessonDocs.bulkPut(snap.docs);
    if (snap.assets?.length) await database.assets.bulkPut(snap.assets);
    if (snap.quizzes?.length) await database.quizzes.bulkPut(snap.quizzes);
    if (snap.attempts?.length) await database.attempts.bulkPut(snap.attempts);
    if (snap.progress?.length) await database.progress.bulkPut(snap.progress);
  });
}

async function touchProject(database: EduDB, projectId: string) {
  const p = await database.projects.get(projectId);
  if (p) await database.projects.update(projectId, { updatedAt: Math.max(Date.now(), p.updatedAt + 1) });
}

/* ───────── lessons ───────── */

export async function listLessons(database: EduDB, projectId: string): Promise<Lesson[]> {
  return database.lessons.where('[projectId+order]').between([projectId, -Infinity], [projectId, Infinity]).toArray();
}

export async function createLesson(database: EduDB, projectId: string, input: LessonInput): Promise<Lesson> {
  assertValid(validateLesson(input));
  return database.transaction('rw', database.projects, database.lessons, async () => {
    if (!(await database.projects.get(projectId))) throw new Error('المشروع غير موجود.');
    const existing = await listLessons(database, projectId);
    const now = Date.now();
    const lesson: Lesson = {
      id: newId(),
      projectId,
      title: input.title.trim(),
      summary: (input.summary ?? '').trim(),
      duration: input.duration ?? 0,
      status: input.status ?? 'draft',
      tags: cleanTags(input.tags ?? []),
      order: existing.length ? existing[existing.length - 1].order + 1 : 1,
      createdAt: now,
      updatedAt: now,
    };
    await database.lessons.add(lesson);
    await touchProject(database, projectId);
    return lesson;
  });
}

export async function updateLesson(database: EduDB, id: string, patch: Partial<LessonInput>): Promise<Lesson> {
  return database.transaction('rw', database.projects, database.lessons, async () => {
    const current = await database.lessons.get(id);
    if (!current) throw new Error('الدرس غير موجود.');
    const merged: LessonInput = { ...current, ...patch, title: patch.title ?? current.title };
    assertValid(validateLesson(merged));
    const next: Lesson = {
      ...current,
      title: merged.title.trim(),
      summary: (merged.summary ?? '').trim(),
      duration: merged.duration ?? 0,
      status: merged.status ?? current.status,
      tags: cleanTags(merged.tags ?? []),
      updatedAt: Math.max(Date.now(), current.updatedAt + 1),
    };
    await database.lessons.put(next);
    await touchProject(database, current.projectId);
    return next;
  });
}

export interface LessonSnapshot {
  lesson: Lesson;
  doc: LessonDoc | null;
  assets: Asset[];
  progress?: LessonProgress[];
}

/** Deletes a lesson with its content and media; returns a snapshot for undo. */
export async function deleteLesson(database: EduDB, id: string): Promise<LessonSnapshot> {
  return database.transaction('rw', [database.projects, database.lessons, database.lessonDocs, database.assets, database.progress], async () => {
    const lesson = await database.lessons.get(id);
    if (!lesson) throw new Error('الدرس غير موجود.');
    const doc = (await database.lessonDocs.get(id)) ?? null;
    const assets = await database.assets.where('lessonId').equals(id).toArray();
    await database.assets.where('lessonId').equals(id).delete();
    await database.lessonDocs.delete(id);
    await database.lessons.delete(id);
    const progress = await database.progress.where('lessonId').equals(id).toArray();
    await database.progress.where('lessonId').equals(id).delete();
    await touchProject(database, lesson.projectId);
    return { lesson, doc, assets, progress };
  });
}

export async function restoreLesson(database: EduDB, snap: LessonSnapshot): Promise<void> {
  await database.transaction('rw', [database.projects, database.lessons, database.lessonDocs, database.assets, database.progress], async () => {
    if (!(await database.projects.get(snap.lesson.projectId))) throw new Error('المشروع الأصلي لم يعد موجودًا.');
    await database.lessons.put(snap.lesson);
    if (snap.doc) await database.lessonDocs.put(snap.doc);
    if (snap.assets.length) await database.assets.bulkPut(snap.assets);
    if (snap.progress?.length) await database.progress.bulkPut(snap.progress);
    await touchProject(database, snap.lesson.projectId);
  });
}

/** Swaps a lesson with its neighbour; returns false at either end. */
export async function moveLesson(database: EduDB, id: string, direction: -1 | 1): Promise<boolean> {
  return database.transaction('rw', database.projects, database.lessons, async () => {
    const lesson = await database.lessons.get(id);
    if (!lesson) throw new Error('الدرس غير موجود.');
    const list = await listLessons(database, lesson.projectId);
    const i = list.findIndex((l) => l.id === id);
    const j = i + direction;
    if (j < 0 || j >= list.length) return false;
    const other = list[j];
    await database.lessons.update(lesson.id, { order: other.order });
    await database.lessons.update(other.id, { order: lesson.order });
    await touchProject(database, lesson.projectId);
    return true;
  });
}

/* ───────── querying (pure, runs on data already loaded) ───────── */

export type ProjectSort = 'updated' | 'created' | 'title';

export interface ProjectQuery {
  q?: string;
  subject?: string;
  grade?: string;
  status?: ItemStatus | 'all' | 'active';
  sort?: ProjectSort;
}

const collator = new Intl.Collator('ar');

/** Filters and sorts projects. A text match on any lesson inside a project also matches the project. */
export function queryProjects(projects: Project[], lessons: Lesson[], query: ProjectQuery): Project[] {
  const byProject = new Map<string, Lesson[]>();
  for (const l of lessons) {
    const arr = byProject.get(l.projectId);
    if (arr) arr.push(l);
    else byProject.set(l.projectId, [l]);
  }
  const status = query.status ?? 'active';
  const out = projects.filter((p) => {
    if (status === 'active' && p.status === 'archived') return false;
    if (status !== 'active' && status !== 'all' && p.status !== status) return false;
    if (query.subject && normalizeArabic(p.subject) !== normalizeArabic(query.subject)) return false;
    if (query.grade && p.grade !== query.grade) return false;
    if (!query.q) return true;
    if (matchesQuery(query.q, p.title, p.subject, p.grade, p.description, p.tags)) return true;
    return (byProject.get(p.id) ?? []).some((l) => matchesQuery(query.q!, l.title, l.summary, l.tags));
  });
  const sort = query.sort ?? 'updated';
  out.sort((a, b) =>
    sort === 'title' ? collator.compare(a.title, b.title) : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt,
  );
  return out;
}

export interface LessonQuery {
  q?: string;
  status?: ItemStatus | 'all';
  projectId?: string;
}

export function queryLessons(lessons: Lesson[], projects: Map<string, Project>, query: LessonQuery): Lesson[] {
  const status = query.status ?? 'all';
  return lessons
    .filter((l) => {
      if (query.projectId && l.projectId !== query.projectId) return false;
      if (status !== 'all' && l.status !== status) return false;
      const p = projects.get(l.projectId);
      return matchesQuery(query.q ?? '', l.title, l.summary, l.tags, p?.title, p?.subject);
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function distinctSubjects(projects: Project[]): string[] {
  const seen = new Map<string, string>();
  for (const p of projects) {
    if (p.subject && !seen.has(normalizeArabic(p.subject))) seen.set(normalizeArabic(p.subject), p.subject);
  }
  return [...seen.values()].sort(collator.compare);
}
