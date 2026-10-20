import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { EduDB } from '../../src/db/db';
import { loadSettings, saveSetting } from '../../src/db/settings';
import {
  cleanTags,
  createLesson,
  createProject,
  deleteLesson,
  deleteProject,
  distinctSubjects,
  listLessons,
  moveLesson,
  queryLessons,
  queryProjects,
  restoreLesson,
  restoreProject,
  updateLesson,
  updateProject,
  ValidationError,
} from '../../src/db/projects';
import { matchesQuery, normalizeArabic } from '../../src/db/search';

const fresh = () => new EduDB(`p-${Math.random()}`);

describe('projects', () => {
  it('creates, reads back, updates and keeps createdAt', async () => {
    const d = fresh();
    const p = await createProject(d, { title: '  وحدة الطاقة  ', subject: 'العلوم', grade: 'الصف السابع', tags: 'طاقة، فيزياء, طاقة' });
    expect(p.title).toBe('وحدة الطاقة');
    expect(p.tags).toEqual(['طاقة', 'فيزياء']);
    expect(p.status).toBe('draft');
    const u = await updateProject(d, p.id, { title: 'وحدة الطاقة المتجددة', status: 'in_progress' });
    expect(u.createdAt).toBe(p.createdAt);
    expect(u.updatedAt).toBeGreaterThan(p.updatedAt);
    expect((await d.projects.get(p.id))?.title).toBe('وحدة الطاقة المتجددة');
  });

  it('rejects an empty title, an over-long title and an unknown grade', async () => {
    const d = fresh();
    await expect(createProject(d, { title: '   ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(createProject(d, { title: 'x'.repeat(121) })).rejects.toBeInstanceOf(ValidationError);
    await expect(createProject(d, { title: 'ok', grade: 'غير موجود' })).rejects.toBeInstanceOf(ValidationError);
    expect(await d.projects.count()).toBe(0);
  });

  it('survives closing and reopening the database', async () => {
    const name = `persist-${Math.random()}`;
    const a = new EduDB(name);
    const p = await createProject(a, { title: 'مشروع دائم' });
    await createLesson(a, p.id, { title: 'الدرس الأول' });
    a.close();
    const b = new EduDB(name);
    expect((await b.projects.get(p.id))?.title).toBe('مشروع دائم');
    expect((await listLessons(b, p.id)).map((l) => l.title)).toEqual(['الدرس الأول']);
  });

  it('deleting a project removes its lessons in one transaction, and undo restores both', async () => {
    const d = fresh();
    const p = await createProject(d, { title: 'أ' });
    const other = await createProject(d, { title: 'ب' });
    await createLesson(d, p.id, { title: '1' });
    await createLesson(d, p.id, { title: '2' });
    await createLesson(d, other.id, { title: 'لا يُحذف' });
    const snap = await deleteProject(d, p.id);
    expect(snap.lessons).toHaveLength(2);
    expect(await d.projects.get(p.id)).toBeUndefined();
    expect(await d.lessons.count()).toBe(1);
    await restoreProject(d, snap);
    expect((await listLessons(d, p.id)).map((l) => l.title)).toEqual(['1', '2']);
  });
});

describe('lessons', () => {
  it('belongs to a project, numbers itself in order and bumps the project', async () => {
    const d = fresh();
    const p = await createProject(d, { title: 'مشروع' });
    const l1 = await createLesson(d, p.id, { title: 'أول', duration: 45 });
    const l2 = await createLesson(d, p.id, { title: 'ثانٍ' });
    expect([l1.order, l2.order]).toEqual([1, 2]);
    expect(l1.projectId).toBe(p.id);
    expect((await d.projects.get(p.id))!.updatedAt).toBeGreaterThanOrEqual(p.updatedAt);
  });

  it('cannot be created for a missing project and validates duration', async () => {
    const d = fresh();
    await expect(createLesson(d, 'nope', { title: 'x' })).rejects.toThrow();
    const p = await createProject(d, { title: 'm' });
    await expect(createLesson(d, p.id, { title: 'x', duration: -5 })).rejects.toBeInstanceOf(ValidationError);
    await expect(createLesson(d, p.id, { title: 'x', duration: 12.5 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('reorders by swapping neighbours and stops at the ends', async () => {
    const d = fresh();
    const p = await createProject(d, { title: 'm' });
    const a = await createLesson(d, p.id, { title: 'A' });
    await createLesson(d, p.id, { title: 'B' });
    const c = await createLesson(d, p.id, { title: 'C' });
    expect(await moveLesson(d, c.id, -1)).toBe(true);
    expect((await listLessons(d, p.id)).map((l) => l.title)).toEqual(['A', 'C', 'B']);
    expect(await moveLesson(d, a.id, -1)).toBe(false);
    expect(await moveLesson(d, a.id, 1)).toBe(true);
    expect((await listLessons(d, p.id)).map((l) => l.title)).toEqual(['C', 'A', 'B']);
  });

  it('updates, deletes and restores a lesson; restore fails if the project is gone', async () => {
    const d = fresh();
    const p = await createProject(d, { title: 'm' });
    const l = await createLesson(d, p.id, { title: 'قديم' });
    await updateLesson(d, l.id, { title: 'جديد', status: 'ready', tags: ['مراجعة'] });
    expect((await d.lessons.get(l.id))?.title).toBe('جديد');
    const removed = await deleteLesson(d, l.id);
    expect(await d.lessons.get(l.id)).toBeUndefined();
    await restoreLesson(d, removed);
    expect((await d.lessons.get(l.id))?.title).toBe('جديد');
    await deleteProject(d, p.id);
    await expect(restoreLesson(d, removed)).rejects.toThrow();
  });
});

describe('Arabic search', () => {
  it('normalises hamza, alef maqsura, ta marbuta, diacritics, tatweel and Arabic digits', () => {
    expect(normalizeArabic('الأَهْدافُ')).toBe('الاهداف');
    expect(normalizeArabic('مُسْتَوى الطاقــة ٣')).toBe('مستوي الطاقه 3');
    expect(matchesQuery('اهداف الدرس', 'تحديد الأهداف في الدرس')).toBe(true);
    expect(matchesQuery('كهرباء', 'تحديد الأهداف')).toBe(false);
  });

  it('filters and sorts projects; a lesson match finds its project; archived hidden by default', async () => {
    const d = fresh();
    const energy = await createProject(d, { title: 'الطاقة', subject: 'العلوم', grade: 'الصف السابع' });
    const poetry = await createProject(d, { title: 'الشعر الجاهلي', subject: 'اللغة العربية', grade: 'الصف العاشر' });
    const old = await createProject(d, { title: 'قديم', subject: 'العلوم', status: 'archived' });
    await createLesson(d, poetry.id, { title: 'معلقة امرئ القيس' });
    const projects = await d.projects.toArray();
    const lessons = await d.lessons.toArray();
    expect(queryProjects(projects, lessons, { subject: 'العلوم' }).map((p) => p.id)).toEqual([energy.id]);
    expect(queryProjects(projects, lessons, { subject: 'العلوم', status: 'all' }).map((p) => p.id).sort()).toEqual([energy.id, old.id].sort());
    expect(queryProjects(projects, lessons, { q: 'امرئ' }).map((p) => p.id)).toEqual([poetry.id]);
    expect(queryProjects(projects, lessons, { grade: 'الصف العاشر' }).map((p) => p.id)).toEqual([poetry.id]);
    expect(queryProjects(projects, lessons, { sort: 'title' }).map((p) => p.title)).toEqual(['الشعر الجاهلي', 'الطاقة']);
    const map = new Map(projects.map((p) => [p.id, p]));
    expect(queryLessons(lessons, map, { q: 'الشعر' })).toHaveLength(1);
    expect(distinctSubjects(projects)).toEqual(['العلوم', 'اللغة العربية']);
  });

  it('cleans tags: trims, removes #, de-duplicates across spelling variants, caps the count', () => {
    expect(cleanTags('#الأهداف, الاهداف، تقويم')).toEqual(['الأهداف', 'تقويم']);
    expect(cleanTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(12);
  });
});

describe('schema migration', () => {
  it('upgrading a phase-0 (v1) database keeps its settings and adds the new tables', async () => {
    const name = `mig-${Math.random()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ settings: 'key', meta: 'key' });
    await v1.open();
    await v1.table('settings').put({ key: 'theme', value: 'light', updatedAt: 1 });
    await v1.table('settings').put({ key: 'ownerFullName', value: 'إبراهيم', updatedAt: 1 });
    v1.close();

    const v2 = new EduDB(name);
    await v2.open();
    expect(v2.verno).toBe(6); // opens at the current schema version
    const s = await loadSettings(v2);
    expect(s.theme).toBe('light');
    expect(s.ownerFullName).toBe('إبراهيم');
    const p = await createProject(v2, { title: 'بعد الترقية' });
    expect(await v2.projects.get(p.id)).toBeTruthy();
    await saveSetting(v2, 'theme', 'dark');
  });
});
