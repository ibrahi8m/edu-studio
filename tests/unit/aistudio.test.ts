import { readFileSync } from 'node:fs';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { AVOID_MARKER, buildPrompt, ensureLogo, EXECUTE_LINE, EXECUTE_MARKER, IDENTITY_MARKER, LOGO_MARKER, mandatoryLogo, SPEC_MARKER, promptAsText, resolveBrand, roughTranslate } from '../../src/aistudio/engine';
import { IBRAHI8M_MARK, IDENTITIES } from '../../src/aistudio/brandSpec';
import { BUILTIN_BRANDS, DESIGN_TYPES, EMPTY_INPUT, RATIOS } from '../../src/aistudio/catalog';
import { deleteBrand, deletePrompt, duplicatePrompt, listBrands, normalizeSavedPrompt, saveBrand, savePrompt } from '../../src/aistudio/store';
import { EduDB, SCHEMA_VERSION } from '../../src/db/db';
import { audienceLine, cleanDetails, isPublished, kindOf } from '../../src/db/contentKinds';
import { createLesson, createProject, deleteLesson, deleteProject, queryProjects, restoreLesson, restoreProject, setPublished, updateLesson, updateProject } from '../../src/db/projects';
import { saveLessonEditor } from '../../src/db/lessonDocs';
import { gradeSubmission, getLearner, saveLearner, saveSubmission, SubmissionLockedError, withdrawSubmission, normalizeLearner } from '../../src/learner/db';
import { assignmentState, recommend } from '../../src/learner/rules';
import { emptyDoc, newBlock, normalizeDoc } from '../../src/lesson/model';
import type { ActivityBlock, FileBlock, HeadingBlock, TextBlock } from '../../src/lesson/types';
import type { Attempt } from '../../src/quiz/types';
import { lessonSections, summarizeProgress } from '../../src/student/sections';

const fresh = () => new EduDB(`a-${Math.random()}`);

/* ───────── AI Design Studio (local rules engine) ───────── */

describe('AI Design Studio engine', () => {
  it('builds an English prompt with type, ratio and style; Arabic explanation says no image is generated', () => {
    const out = buildPrompt({ ...EMPTY_INPUT, idea: 'A robot teacher in a classroom', type: 'educational', ratio: '16:9', style: 'flat' }, 'pro', null);
    expect(out.promptEn).toMatch(/^An educational illustration for learners about A robot teacher in a classroom/);
    expect(out.promptEn).toContain('wide 16:9 aspect ratio');
    expect(out.promptEn).toContain('flat vector illustration');
    expect(out.explanationAr).toContain('لا يولّد صورًا');
    expect(out.warnings).toEqual([]);
    expect(out.negative).toContain('invented logos');
  });

  it('every design type and ratio produces a prompt; the list is the single place to extend', () => {
    for (const t of DESIGN_TYPES)
      for (const r of RATIOS) {
        const out = buildPrompt({ ...EMPTY_INPUT, idea: 'olive tree', type: t.value, ratio: r.value }, 'quick', null);
        expect(out.promptEn.length).toBeGreaterThan(30);
        expect(out.ratio).toContain(r.size);
        expect(out.typeLabel).toBe(t.ar);
      }
  });

  it('Arabic ideas are translated roughly and unknown words are reported, never hidden', () => {
    const tr = roughTranslate('طالب يقرأ كتابًا في الحديقة مع زرافة');
    expect(tr.approximate).toBe(true);
    expect(tr.english).toContain('student');
    expect(tr.english).toContain('reading');
    expect(tr.english).toContain('garden');
    expect(tr.unknown).toContain('زرافة');
    const out = buildPrompt({ ...EMPTY_INPUT, idea: 'طالب مع زرافة' }, 'pro', null);
    expect(out.warnings.join(' ')).toContain('زرافة');
    // An English description written by the user replaces the rough translation.
    const own = buildPrompt({ ...EMPTY_INPUT, idea: 'طالب مع زرافة', subjectEn: 'a student feeding a giraffe' }, 'pro', null);
    expect(own.promptEn).toContain('a student feeding a giraffe');
    expect(own.warnings).toEqual([]);
  });

  it('texts are quoted exactly (Arabic letterforms requested)', () => {
    const out = buildPrompt({ ...EMPTY_INPUT, idea: 'poster', texts: 'الأمن الرقمي\nاحمِ بياناتك', textPlacement: 'top' }, 'quick', null);
    expect(out.promptEn).toContain('"الأمن الرقمي", "احمِ بياناتك" placed at the top');
    expect(out.promptEn).toContain('right-to-left Arabic');
    expect(out.texts).toEqual(['الأمن الرقمي', 'احمِ بياناتك']);
  });

  it('1.3.0/1.4.0 MANDATORY + SELF-CONTAINED: every prompt — every design type (including ones added later), ratio, mode and identity — ends with the original logo instructions, inside the prompt text itself', () => {
    const brands = [null, resolveBrand('brand-edu-studio', [])!, resolveBrand('brand-ai-universe', [])!];
    // a design type added in the future gets it too, with no code change
    DESIGN_TYPES.push({ value: 'future-type', ar: 'نوع جديد', en: 'brand new kind of design', needs: 'x', ratio: '1:1', negative: '' });
    try {
      for (const t of DESIGN_TYPES)
        for (const mode of ['quick', 'pro', 'brand'] as const)
          for (const brand of brands)
            for (const placement of ['auto', 'bottom-left', '', 'nonsense']) {
              const out = buildPrompt({ ...EMPTY_INPUT, idea: 'olive tree', type: t.value, logoPlacement: placement }, mode, brand, t.value.length);
              const where = `${t.value}/${mode}/${brand?.id}/${placement}`;
              expect(out.promptEn, where).toContain(LOGO_MARKER);
              expect(out.promptEn, where).toContain('Draw the IBRAHI8M brand logo described below into the design yourself.');
              expect(out.promptEn, where).toContain('must never be omitted');
              // 1.4.0 self-contained: the full specification is in the text, and nothing depends on a file
              expect(out.promptEn, where).toContain(SPEC_MARKER);
              for (const hex of ['#0E1014', '#171B22', '#06080B', '#F2F4F7', '#A9B1BC', '#5D6673', '#2F7BFF', '#5B9BFF', '#E3EEFF']) expect(out.promptEn, `${where} ${hex}`).toContain(hex);
              expect(out.promptEn, where).toContain('I-B-R-A-H-I-8-M');
              expect(out.promptEn, where).toContain('robot head');
              expect(out.promptEn, where).toContain('circuit ring');
              expect(out.promptEn, where).toMatch(/Logo size: (about \d+–\d+% of the|large and central)/);
              expect(out.promptEn, where).not.toMatch(/\.svg|\.png|\/brand\/|provided with the project|use the (attached|uploaded)/i) // it now says «do not ask for a logo file, an upload»;
              expect(out.promptEn, where).toContain('do not ask for a logo file, an upload or any confirmation');
              // 1.5.0: nothing that makes ChatGPT ask for the file (it did with «original official … reproduce exactly»)
              expect(out.promptEn, where).not.toMatch(/original official|placed over it afterwards|No logo file is attached/);
              expect(out.promptEn, where).toContain('do not restyle, distort, crop, recolor, or simplify it');
              expect(out.promptEn.split(LOGO_MARKER)).toHaveLength(2); // exactly once
              expect(out.promptEn.split(SPEC_MARKER)).toHaveLength(2);
              // 1.5.0 order: … logo block → avoid list → EXECUTE IMMEDIATELY last
              expect(out.promptEn.split(out.logoRules)).toHaveLength(2);
              expect(out.promptEn.endsWith(EXECUTE_LINE), where).toBe(true);
              expect(out.promptEn.indexOf(LOGO_MARKER)).toBeLessThan(out.promptEn.indexOf(AVOID_MARKER));
              expect(out.promptEn.split(EXECUTE_MARKER)).toHaveLength(2);
              expect(out.negative).toContain('missing logo');
            }
    } finally {
      DESIGN_TYPES.pop();
    }
  });

  it('1.3.0: the three owner examples carry the logo; placement is used; the owner\'s own logo remark is merged, not repeated', () => {
    for (const [idea, type] of [
      ['رجل يلعب كرة بين الخيام', 'campaign'],
      ['إعلان تعليمي عن الأمن الرقمي', 'educational'],
      ['تصميم معماري لمدرسة حديثة', 'architecture'],
    ]) {
      const out = buildPrompt({ ...EMPTY_INPUT, idea, type }, 'pro', resolveBrand('brand-edu-studio', [])!);
      expect(out.promptEn, idea).toContain(LOGO_MARKER);
      expect(out.promptEn, idea).toContain('bottom-left corner');
    }
    const auto = buildPrompt({ ...EMPTY_INPUT, idea: 'x', logoPlacement: 'auto' }, 'pro', null);
    expect(auto.promptEn).toContain('a suitable, clearly visible corner of the composition');
    const own = buildPrompt({ ...EMPTY_INPUT, idea: 'poster with my logo', required: 'الشعار كبير وواضح، شجرة زيتون' }, 'pro', null);
    expect(own.promptEn.match(/\blogo\b/gi)!.length).toBeGreaterThan(3);
    expect(own.promptEn).not.toContain('with my logo');
    expect(own.promptEn).toMatch(/MUST INCLUDE: [^.]*olive/); // the non-logo item stays in «must include»
    expect(own.promptEn).not.toMatch(/MUST INCLUDE:[^.]*logo/);
    expect(own.promptEn).toContain("Owner's note about the logo");
    expect(own.promptEn).toContain('"الشعار كبير وواضح"');
    expect(own.promptEn.split(LOGO_MARKER)).toHaveLength(2);
    expect(own.explanationAr).toContain('دُمجت ملاحظتك عن الشعار');
  });

  it('1.3.0: an edited or older prompt without the block gets it back, exactly once', () => {
    const old = 'An old prompt saved in 1.2.0.';
    const fixed = ensureLogo(old, 'top-right');
    expect(fixed.startsWith(old)).toBe(true);
    expect(fixed).toContain(LOGO_MARKER);
    expect(fixed).toContain('top-right corner');
    expect(ensureLogo(fixed)).toBe(fixed);
    expect(mandatoryLogo('auto')).toContain('suitable, clearly visible corner');
    // a 1.3.0 block (it named a file) is replaced by the self-contained one
    const v13 = `${old}\n\nMANDATORY BRAND LOGO: Use the exact original logo asset provided with the project (ibrahi8m-mark.svg).`;
    const up = ensureLogo(v13, 'auto');
    expect(up).not.toContain('ibrahi8m-mark.svg');
    expect(up).toContain(SPEC_MARKER);
    expect(up.split(LOGO_MARKER)).toHaveLength(2);
    expect(up.startsWith(old)).toBe(true);
  });

  it('1.4.0 identity tests: educational post, infographic, ad, creative design and the other identity — the right identity section, no brand mixing', () => {
    const edu = resolveBrand('brand-edu-studio', [])!;
    const uni = resolveBrand('brand-ai-universe', [])!;
    const cases: [string, string, string, typeof edu][] = [
      ['منشور تعليمي عن الأمن الرقمي', 'social', 'flat', edu],
      ['إنفوجرافيك عن دورة الماء', 'infographic', '', edu],
      ['إعلان عن دورة برمجة', 'commercial', '', edu],
      ['تصميم إبداعي لروبوت يرسم', 'poster', 'surreal', edu],
      ['لوحة فنية لمجرة', 'poster', 'surreal', uni],
    ];
    for (const [idea, type, style, brand] of cases)
      for (const mode of ['quick', 'pro', 'brand'] as const) {
        const out = buildPrompt({ ...EMPTY_INPUT, idea, type, style }, mode, brand);
        const where = `${idea}/${mode}`;
        const identity = out.promptEn.slice(out.promptEn.indexOf(IDENTITY_MARKER), out.promptEn.indexOf(LOGO_MARKER));
        expect(identity, where).toContain(`${IDENTITY_MARKER} — ${brand.name}`);
        expect(out.promptEn.split(IDENTITY_MARKER)).toHaveLength(2);
        expect(out.promptEn.indexOf(IDENTITY_MARKER)).toBeLessThan(out.promptEn.indexOf(LOGO_MARKER)); // logo block stays last
        if (brand === edu) {
          expect(identity).toContain('#2F7BFF');
          expect(out.logoRules).toContain('second line "EDU STUDIO"');
          expect(identity).not.toMatch(/belongs to IBRAHIM AI UNIVERSE/);
        } else {
          expect(identity).toContain('has no logo artwork of its own: do not invent');
          expect(identity).not.toContain('#2F7BFF'); // no educational palette
          expect(out.logoRules).toContain('with no second line');
          expect(out.logoRules).not.toContain('"EDU STUDIO"');
        }
      }
    // no identity chosen: still the logo and its full specification, no identity section
    const none = buildPrompt({ ...EMPTY_INPUT, idea: 'x' }, 'pro', null);
    expect(none.promptEn).not.toContain(IDENTITY_MARKER);
    expect(none.promptEn).toContain(SPEC_MARKER);
  });

  it('1.4.0: the specification matches the real logo file (every colour and measurement comes from ibrahi8m-mark.svg)', () => {
    const svg = readFileSync(new URL('../../public/brand/ibrahi8m-mark.svg', import.meta.url), 'utf8');
    for (const c of Object.values(IBRAHI8M_MARK.colors)) expect(svg.toUpperCase(), c.hex).toContain(`"${c.hex.toUpperCase()}"`);
    const num = (re: RegExp) => Number(svg.match(re)![1]);
    const pct = (n: number) => Math.round((n / 512) * 100);
    expect(pct(num(/<rect width="512" height="512" rx="(\d+)"/))).toBe(IBRAHI8M_MARK.geometry.tileCornerRadiusPct);
    expect(pct(2 * 100 + 24)).toBe(IBRAHI8M_MARK.geometry.upperLoopOuterDiameterPct);
    expect(svg).toContain('cy="168" r="100"');
    expect(svg).toContain('stroke-width="24"');
    expect(svg).toContain('cy="350" r="90"');
    expect(pct(2 * 90 + 26)).toBe(IBRAHI8M_MARK.geometry.lowerLoopOuterDiameterPct);
    expect(pct(168 + 6)).toBe(IBRAHI8M_MARK.geometry.upperCentreYPct);
    expect(pct(350 + 6)).toBe(IBRAHI8M_MARK.geometry.lowerCentreYPct);
    expect(Math.round((156 / 224) * 100)).toBe(IBRAHI8M_MARK.geometry.visorWidthOfHeadPct);
    expect(svg).toContain('width="156" height="74" rx="37"');
    expect(IDENTITIES['brand-ai-universe'].hasLogoArtwork).toBe(false);
  });

  it('quick mode is shorter than professional; brand mode adds the saved identity rules', () => {
    const input = { ...EMPTY_INPUT, idea: 'digital security for students', lighting: 'soft', background: 'dark', composition: 'thirds' };
    const quick = buildPrompt(input, 'quick', null);
    const pro = buildPrompt(input, 'pro', null);
    expect(quick.promptEn.length).toBeLessThan(pro.promptEn.length);
    expect(quick.promptEn).not.toContain('soft diffused lighting');
    expect(pro.promptEn).toContain('soft diffused lighting');
    const edu = resolveBrand('brand-edu-studio', [])!;
    const brand = buildPrompt(input, 'brand', edu);
    expect(brand.promptEn).toContain('electric blue #2F7BFF');
    expect(brand.negative).toContain('elements of other brands');
    // Brand mode without a brand falls back and says so.
    expect(buildPrompt(input, 'brand', null).warnings.join(' ')).toContain('هوية محفوظة');
  });

  it('keeps the two identities apart: mentioning the other one is flagged; the universe brand has no invented colours', () => {
    const edu = resolveBrand('brand-edu-studio', [])!;
    const out = buildPrompt({ ...EMPTY_INPUT, idea: 'IBRAHIM AI UNIVERSE launch' }, 'brand', edu);
    expect(out.warnings.join(' ')).toContain('هوية أخرى');
    const uni = resolveBrand('brand-ai-universe', [])!;
    expect(uni.colors).toBe('');
    expect(buildPrompt({ ...EMPTY_INPUT, idea: 'x' }, 'brand', uni).warnings.join(' ')).toContain('بلا ألوان');
    expect(buildPrompt({ ...EMPTY_INPUT, idea: 'IBRAHI8M EDU STUDIO poster' }, 'brand', uni).warnings.join(' ')).toContain('هوية أخرى');
  });

  it('regenerate is deterministic per variant and changes the wording', () => {
    const input = { ...EMPTY_INPUT, idea: 'olive tree at sunset', lighting: 'golden', angle: 'low' };
    const a = buildPrompt(input, 'pro', null, 0);
    expect(buildPrompt(input, 'pro', null, 0).promptEn).toBe(a.promptEn);
    expect(buildPrompt(input, 'pro', null, 1).promptEn).not.toBe(a.promptEn);
  });

  it('.txt export has the prompt, negative prompt and the no-image note', () => {
    const out = buildPrompt({ ...EMPTY_INPUT, idea: 'olive' }, 'pro', null);
    const txt = promptAsText('تجربة', out, out.promptEn);
    expect(txt).toContain('PROMPT (EN):');
    expect(txt).toContain('NEGATIVE PROMPT:');
    expect(txt).toContain('لم يُولَّد أي تصميم');
  });

  it('library and identities persist: save, edit, duplicate, delete; built-in identity edits can be reset', async () => {
    const d = fresh();
    const input = { ...EMPTY_INPUT, idea: 'olive' };
    const out = buildPrompt(input, 'pro', null);
    const p = await savePrompt(d, { title: 'زيتون', mode: 'pro', brandId: null, input, output: out });
    const again = await savePrompt(d, { id: p.id, title: 'زيتون 2', mode: 'pro', brandId: null, input, output: out, editedPrompt: 'edited' });
    expect(again.id).toBe(p.id);
    expect(again.createdAt).toBe(p.createdAt);
    expect((await d.prompts.get(p.id))!.editedPrompt).toBe('edited');
    const copy = await duplicatePrompt(d, p.id);
    expect(copy.title).toContain('نسخة');
    expect(await d.prompts.count()).toBe(2);
    await deletePrompt(d, p.id);
    expect(await d.prompts.count()).toBe(1);
    expect(normalizeSavedPrompt({ id: 'x' })).toBeNull();

    expect((await listBrands(d)).map((b) => b.id)).toEqual(BUILTIN_BRANDS.map((b) => b.id));
    await saveBrand(d, { ...BUILTIN_BRANDS[1], colors: 'deep purple, cyan' });
    expect((await listBrands(d)).find((b) => b.id === 'brand-ai-universe')!.colors).toBe('deep purple, cyan');
    await deleteBrand(d, 'brand-ai-universe');
    expect((await listBrands(d)).find((b) => b.id === 'brand-ai-universe')!.colors).toBe('');
    const mine = await saveBrand(d, { name: 'مدرستي', description: '', colors: 'green', fonts: '', tone: '', logoRules: '', rules: '', avoid: '' });
    expect((await listBrands(d)).map((b) => b.id)).toContain(mine.id);
  });
});

/* ───────── content kinds ───────── */

describe('content kinds (1.1.0)', () => {
  it('projects from before 1.1.0 read as published school content', () => {
    expect(kindOf({})).toBe('school');
    expect(isPublished({})).toBe(true);
    expect(isPublished({ published: false })).toBe(false);
  });

  it('creates university and training content with their own fields; unknown fields and options are dropped', async () => {
    const d = fresh();
    const u = await createProject(d, {
      title: 'تصميم المحتوى الرقمي',
      subject: 'تصميم المحتوى الرقمي',
      kind: 'university',
      details: { specialization: 'المناهج وطرق التدريس', degree: 'ماجستير', level: 'السنة الأولى', references: 'مرجع 1\nمرجع 2', semester: 'الفصل الأول', hack: 'x' },
    });
    expect(u.kind).toBe('university');
    expect(u.grade).toBe('التعليم الجامعي');
    expect(u.details).toEqual({ specialization: 'المناهج وطرق التدريس', degree: 'ماجستير', level: 'السنة الأولى', references: 'مرجع 1\nمرجع 2' });
    expect(audienceLine(u)).toContain('ماجستير');
    expect(cleanDetails('university', { degree: 'دبلوم' })).toEqual({});
    const t = await createProject(d, { title: 'التعلم النشط', subject: 'استراتيجيات', kind: 'training', published: false, details: { targetTeachers: 'معلمو العلوم', duration: '3 أيام', axes: 'محور 1' } });
    expect(t.published).toBe(false);
    expect(t.grade).toBe('تدريب المعلمين');
    const s = await createProject(d, { title: 'وحدة', grade: 'الصف الثامن', details: { semester: 'الفصل الثاني' } });
    expect(s.kind).toBe('school');
    expect(s.published).toBe(true);
    expect(s.details).toEqual({ semester: 'الفصل الثاني' });

    const all = await d.projects.toArray();
    expect(queryProjects(all, [], { kind: 'training', status: 'all' }).map((p) => p.id)).toEqual([t.id]);
    expect(queryProjects(all, [], { publication: 'unpublished', status: 'all' }).map((p) => p.id)).toEqual([t.id]);
    expect(queryProjects(all, [], { q: 'المناهج', status: 'all' }).map((p) => p.id)).toEqual([u.id]);

    await setPublished(d, t.id, true);
    expect((await d.projects.get(t.id))!.published).toBe(true);
    // Editing keeps the kind and publication when they are not part of the patch.
    const t2 = await updateProject(d, t.id, { title: 'التعلم النشط 2' });
    expect(t2.kind).toBe('training');
    expect(t2.published).toBe(true);
    expect(t2.details?.targetTeachers).toBe('معلمو العلوم');
  });

  it('lessons keep an optional unit; clearing it removes the field', async () => {
    const d = fresh();
    const p = await createProject(d, { title: 'م' });
    const l = await createLesson(d, p.id, { title: 'د', unit: ' الوحدة الأولى ' });
    expect(l.unit).toBe('الوحدة الأولى');
    const l2 = await updateLesson(d, l.id, { unit: '' });
    expect('unit' in l2).toBe(false);
    const l3 = await createLesson(d, p.id, { title: 'د2' });
    expect(l3.unit).toBeUndefined();
  });
});

/* ───────── learner environment ───────── */

function att(percent: number, pass: number, at: number, pending = 0): Attempt {
  return {
    id: `a${at}`,
    quizId: 'q',
    studentKey: 'k',
    studentName: 'k',
    preview: false,
    status: 'submitted',
    quiz: { id: 'q', title: 'q', settings: { passPercent: pass } as never, questions: [], rev: 1, lessonId: 'l', projectId: 'p' },
    order: [],
    optionOrder: {},
    answers: {},
    flagged: [],
    startedAt: at,
    deadline: null,
    submittedAt: at,
    timedOut: false,
    result: { earned: percent, max: 100, percent, passed: percent >= pass, pendingReview: pending, questions: [] },
  };
}

describe('learner environment (1.1.0)', () => {
  it('profiles: default type school, fields kept per type, one profile per name', async () => {
    const d = fresh();
    expect(normalizeLearner({ name: '  ' })).toBeNull();
    const a = await saveLearner(d, { name: 'سارة', type: 'university', specialization: 'تكنولوجيا التعليم', level: 'السنة الثالثة', learnerId: '2021' });
    expect(a.type).toBe('university');
    const b = await saveLearner(d, { name: 'سارة ', assigned: ['p1'] });
    expect(b.createdAt).toBe(a.createdAt);
    expect(b.specialization).toBe('تكنولوجيا التعليم');
    expect(b.assigned).toEqual(['p1']);
    expect(await d.learners.count()).toBe(1);
    expect((await getLearner(d, 'سارة'))!.learnerId).toBe('2021');
    expect((await saveLearner(d, { name: 'علي', type: 'bad' as never })).type).toBe('school');
  });

  it('assignments: draft is local, submit locks, withdraw reopens, teacher grades; empty submit refused', async () => {
    const d = fresh();
    const lesson = { id: 'l1', projectId: 'p1' };
    const block = { id: 'b1', title: 'تكليف' };
    expect(assignmentState(null, 0)).toBe('not_started');
    expect(assignmentState(null, 2)).toBe('in_progress');
    await expect(saveSubmission(d, 'منى', lesson, block, { submit: true })).rejects.toThrow('قبل التسليم');
    const draft = await saveSubmission(d, 'منى', lesson, block, { answer: 'مسودة' });
    expect(assignmentState(draft, 0)).toBe('draft');
    await expect(gradeSubmission(d, draft.id, 90, '')).rejects.toThrow('لم يُسلَّم');
    const sent = await saveSubmission(d, 'منى', lesson, block, { answer: 'إجابتي', submit: true });
    expect(sent.status).toBe('submitted');
    expect(sent.submittedAt).not.toBeNull();
    await expect(saveSubmission(d, 'منى', lesson, block, { answer: 'تعديل' })).rejects.toBeInstanceOf(SubmissionLockedError);
    await withdrawSubmission(d, sent.id);
    expect((await d.submissions.get(sent.id))!.status).toBe('draft');
    await saveSubmission(d, 'منى', lesson, block, { answer: 'نهائية', submit: true });
    const g = await gradeSubmission(d, sent.id, 140, ' أحسنت ');
    expect(g.status).toBe('graded');
    expect(g.score).toBe(100);
    expect(g.feedback).toBe('أحسنت');
    await expect(withdrawSubmission(d, sent.id)).rejects.toBeInstanceOf(SubmissionLockedError);
    // Removing the grade returns it to «تم التسليم».
    expect((await gradeSubmission(d, sent.id, null, '')).status).toBe('submitted');
  });

  it('deleting a lesson or a project removes its submissions, and undo restores them', async () => {
    const d = fresh();
    const p = await createProject(d, { title: 'م' });
    const l = await createLesson(d, p.id, { title: 'د' });
    await saveSubmission(d, 'منى', l, { id: 'b', title: 't' }, { answer: 'x', submit: true });
    const snap = await deleteLesson(d, l.id);
    expect(await d.submissions.count()).toBe(0);
    await restoreLesson(d, snap);
    expect(await d.submissions.count()).toBe(1);
    const ps = await deleteProject(d, p.id);
    expect(await d.submissions.count()).toBe(0);
    await restoreProject(d, ps);
    expect(await d.submissions.count()).toBe(1);
  });

  it('remedial and enrichment follow a fixed rule on the latest attempt (not AI)', () => {
    const doc = emptyDoc('l');
    const rem = { ...(newBlock('activity') as ActivityBlock), title: 'علاجي', track: 'remedial' as const };
    const enr = { ...(newBlock('activity') as ActivityBlock), title: 'إثرائي', track: 'enrichment' as const };
    doc.blocks = [rem, enr];
    expect(recommend(doc, []).kind).toBe('none');
    const low = recommend(doc, [att(90, 60, 1), att(40, 60, 2)]);
    expect(low.kind).toBe('remedial');
    expect(low.activities.map((a) => a.title)).toEqual(['علاجي']);
    expect(recommend(doc, [att(85, 60, 1)]).kind).toBe('enrichment');
    expect(recommend(doc, [att(70, 60, 1)]).kind).toBe('on_track');
    expect(recommend(doc, [att(30, 60, 1, 1)]).reason).toContain('مبدئية');
  });

  it('remedial/enrichment activities are not lesson parts and their steps do not count in progress', () => {
    const doc = emptyDoc('l');
    const h = newBlock('heading') as HeadingBlock;
    h.text = 'قسم';
    h.level = 2;
    const core = { ...(newBlock('activity') as ActivityBlock), steps: 'أ\nب' };
    const extra = { ...(newBlock('activity') as ActivityBlock), steps: 'ج\nد\nه', track: 'enrichment' as const };
    doc.blocks = [h, core, extra];
    const sections = lessonSections(doc);
    expect(sections.map((s) => s.kind)).toEqual(['intro', 'content', 'end']);
    expect(sections[1].blocks).toEqual([core]);
    expect(summarizeProgress(doc, null).activitySteps).toBe(2);
  });
});

/* ───────── lesson file block and old data ───────── */

describe('file block and old lesson content', () => {
  it('normalizes file blocks and gives old activities the default track', () => {
    const doc = normalizeDoc(
      {
        lessonId: 'l',
        blocks: [
          { id: 'a', type: 'activity', title: 'قديم', grouping: 'pairs', duration: 5, steps: '', materials: '', output: '', objectiveIds: [] },
          { id: 'f', type: 'file', assetId: 'x', title: 'ورقة عمل', description: 'اطبعها' },
        ],
      },
      'l',
    );
    const a = doc.blocks[0] as ActivityBlock;
    expect(a.track).toBe('core');
    expect(a.submit).toBe(false);
    const f = doc.blocks[1] as FileBlock;
    expect(f).toMatchObject({ type: 'file', assetId: 'x', title: 'ورقة عمل', description: 'اطبعها' });
  });

  it('saving a lesson with a file block keeps it', async () => {
    const d = fresh();
    const p = await createProject(d, { title: 'م' });
    const l = await createLesson(d, p.id, { title: 'د' });
    const doc = emptyDoc(l.id);
    const f = newBlock('file') as FileBlock;
    f.title = 'ملف';
    const t = newBlock('text') as TextBlock;
    t.text = 'نص';
    doc.blocks = [t, f];
    await saveLessonEditor(d, l.id, doc, { title: l.title, summary: '', duration: 0 }, 0);
    expect(normalizeDoc(await d.lessonDocs.get(l.id), l.id).blocks.map((b) => b.type)).toEqual(['text', 'file']);
  });
});

/* ───────── upgrade from 1.0.0 (schema v7) ───────── */

describe('upgrade from schema v7', () => {
  it('opens a v7 database with its data intact and adds the new tables', async () => {
    const name = `up-${Math.random()}`;
    const old = new Dexie(name);
    old.version(7).stores({
      settings: 'key',
      meta: 'key',
      projects: 'id, updatedAt, createdAt, title, subject, grade, status, *tags',
      lessons: 'id, projectId, [projectId+order], updatedAt, status, *tags',
      lessonDocs: 'lessonId, updatedAt',
      assets: 'id, lessonId, kind, createdAt',
      quizzes: 'id, projectId, lessonId, updatedAt',
      attempts: 'id, quizId, [quizId+studentKey], status, submittedAt',
      progress: 'id, studentKey, lessonId, projectId, updatedAt',
      designs: 'id, projectId, lessonId, kind, updatedAt',
      library: 'id, kind, updatedAt, *tags',
    });
    await old.open();
    await old.table('projects').add({ id: 'p', title: 'قديم', subject: '', grade: '', description: '', status: 'draft', tags: [], color: 'blue', createdAt: 1, updatedAt: 1 });
    await old.table('lessons').add({ id: 'l', projectId: 'p', title: 'درس', summary: '', duration: 0, status: 'draft', tags: [], order: 1, createdAt: 1, updatedAt: 1 });
    old.close();

    const d = new EduDB(name);
    await d.open();
    expect(d.verno).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(8);
    const p = (await d.projects.get('p'))!;
    expect(p.title).toBe('قديم');
    expect(kindOf(p)).toBe('school');
    expect(isPublished(p)).toBe(true);
    expect((await d.lessons.get('l'))!.title).toBe('درس');
    expect(await d.learners.count()).toBe(0);
    expect(await d.submissions.count()).toBe(0);
    expect(await d.prompts.count()).toBe(0);
    expect(await d.brands.count()).toBe(0);
    d.close();
  });
});
