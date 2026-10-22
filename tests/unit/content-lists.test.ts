import { describe, expect, it } from 'vitest';
import { EduDB } from '../../src/db/db';
import { GRADES } from '../../src/db/catalog';
import { createProject, updateProject } from '../../src/db/projects';

const fresh = () => new EduDB(`cl-${Math.random()}`);

describe('1.6.0 school / university lists', () => {
  it('«أخرى» and «غير محدد» are not offered and are refused when sent directly', async () => {
    expect(GRADES).not.toContain('أخرى');
    const db = fresh();
    await expect(createProject(db, { title: 'م', kind: 'school', grade: 'أخرى', details: { semester: 'الفصل الأول' } })).rejects.toThrow('اختر الصف');
    await expect(createProject(db, { title: 'م', kind: 'school', grade: '', details: { semester: 'الفصل الأول' } })).rejects.toThrow('اختر الصف');
    await expect(createProject(db, { title: 'م', kind: 'school', grade: 'الصف الأول', details: { semester: '' } })).rejects.toThrow('الفصل الدراسي');
    await expect(createProject(db, { title: 'م', kind: 'school', grade: 'الصف الأول', details: { semester: 'العام كاملًا' } })).rejects.toThrow('الفصل الدراسي');
    await expect(createProject(db, { title: 'ج', kind: 'university', details: { degree: '' } })).rejects.toThrow('الدرجة العلمية');
    await expect(createProject(db, { title: 'ج', kind: 'university', details: { degree: 'دبلوم' } })).rejects.toThrow('الدرجة العلمية');
  });

  it('valid values are saved; absent ones take the first option of the list', async () => {
    const db = fresh();
    const s = await createProject(db, { title: 'مدرسي', kind: 'school', grade: 'الصف السابع', details: { semester: 'الفصل الثاني' } });
    expect([s.grade, s.details?.semester]).toEqual(['الصف السابع', 'الفصل الثاني']);
    const u = await createProject(db, { title: 'جامعي', kind: 'university', details: { degree: 'ماجستير' } });
    expect(u.details?.degree).toBe('ماجستير');
    const d = await createProject(db, { title: 'بلا قيم' });
    expect([d.grade, d.details?.semester]).toEqual([GRADES[0], 'الفصل الأول']);
    const du = await createProject(db, { title: 'جامعي بلا قيم', kind: 'university' });
    expect(du.details?.degree).toBe('بكالوريوس');
  });

  it('content saved earlier keeps «أخرى» / no semester / no degree until it is changed; changing to them is refused', async () => {
    const db = fresh();
    const now = Date.now();
    await db.projects.bulkAdd([
      { id: 'old-s', title: 'قديم', subject: '', grade: 'أخرى', description: '', status: 'draft', tags: [], color: 'blue', createdAt: now, updatedAt: now, kind: 'school', details: {} },
      { id: 'old-u', title: 'جامعي قديم', subject: '', grade: 'التعليم الجامعي', description: '', status: 'draft', tags: [], color: 'blue', createdAt: now, updatedAt: now, kind: 'university', details: {} },
    ]);
    const s = await updateProject(db, 'old-s', { title: 'قديم معدّل' });
    expect([s.title, s.grade, s.details?.semester]).toEqual(['قديم معدّل', 'أخرى', undefined]);
    const u = await updateProject(db, 'old-u', { description: 'وصف' });
    expect(u.details?.degree).toBeUndefined();
    // choosing a real value works; going back to an old one does not
    const s2 = await updateProject(db, 'old-s', { grade: 'الصف الثامن', details: { semester: 'الفصل الأول' } });
    expect(s2.grade).toBe('الصف الثامن');
    await expect(updateProject(db, 'old-s', { grade: 'أخرى' })).rejects.toThrow('اختر الصف');
    await expect(updateProject(db, 'old-s', { details: { semester: '' } })).rejects.toThrow('الفصل الدراسي');
    // the stored rows were never rewritten by the refused calls
    expect((await db.projects.get('old-s'))!.grade).toBe('الصف الثامن');
  });

  it('changing the kind fills the new kind’s lists', async () => {
    const db = fresh();
    const u = await createProject(db, { title: 'x', kind: 'university', details: { degree: 'دكتوراه' } });
    const s = await updateProject(db, u.id, { kind: 'school' });
    expect([s.kind, s.grade, s.details?.semester]).toEqual(['school', GRADES[0], 'الفصل الأول']);
  });
});
