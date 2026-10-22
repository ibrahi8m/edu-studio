import { expect, test, type Page } from '@playwright/test';
import { disableSplash, isPhone } from './quiz-helpers';

/** 1.5.0 — prompt fidelity + EXECUTE IMMEDIATELY + «حذف الوصف», and the volume control. */

const EXECUTE =
  "EXECUTE IMMEDIATELY: Generate the final image now, following the user's specified subject, actions, objects, setting, composition, style, and constraints as closely as possible. Do not ask follow-up questions, do not request logo files or additional attachments, and do not provide a text-only description instead of generating the image. Use reasonable judgment only for unspecified, nonessential details. Do not alter the user's core idea.";
const clip = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const audio = (page: Page) =>
  page.evaluate(() => {
    const a = (window as unknown as { ibrahi8mAudio: { getState(): { transport: string }; outputLevel(): number; masterGain(): number } }).ibrahi8mAudio;
    return { transport: a.getState().transport, gain: a.masterGain() };
  });
/** average measured output (RMS after every gain and the compressor) over ~2 s of music */
const level = (page: Page) =>
  page.evaluate(async () => {
    const a = (window as unknown as { ibrahi8mAudio: { outputLevel(): number } }).ibrahi8mAudio;
    let s = 0;
    for (let i = 0; i < 40; i++) {
      s += a.outputLevel();
      await new Promise((r) => setTimeout(r, 50));
    }
    return s / 40;
  });

test.describe('AI Design Studio 1.5.0', () => {
  test('the owner’s examples: the idea is kept word for word, nothing asks for a file, and every prompt ends with EXECUTE IMMEDIATELY', async ({ page, context }, info) => {
    test.skip(!['desktop-1440', 'phone-pixel-7'].includes(info.project.name), 'one computer and one phone size');
    test.setTimeout(150_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await disableSplash(page);
    await page.goto('./#/ai-studio');
    await page.getByTestId('ai-advanced-toggle').click();
    const cases: { idea: string; type: string; en: RegExp; texts?: string; noText?: boolean }[] = [
      { idea: 'طالب يدرس الرياضيات', type: 'educational', en: /student studying mathematics/ },
      { idea: 'طالب يلعب كرة القدم بين خيام غزة', type: 'campaign', en: /student playing football \(soccer\) among tents Gaza/ },
      { idea: 'منشور تعليمي عن المدرسة', type: 'social', en: /school/ },
      { idea: 'إنفوجرافيك تعليمي عن دورة الماء', type: 'infographic', en: /the water cycle/ },
      { idea: 'إعلان للتسجيل في دورة برمجة', type: 'commercial', en: /course/, texts: 'سجّل الآن' },
      { idea: 'تصميم بشعار رسمي للاستوديو', type: 'identity', en: /./ },
      { idea: 'معلمة في غرفة الصف بلا أي نص', type: 'educational', en: /teacher in classroom/, noText: true },
    ];
    for (const c of cases) {
      await page.getByTestId('ai-idea').fill(c.idea);
      await page.getByTestId('ai-type').selectOption(c.type);
      await page.getByTestId('ai-texts').fill(c.texts ?? '');
      await page.getByTestId('ai-generate').click();
      await page.getByTestId('ai-copy').click();
      const t = await clip(page);
      // the user's own words lead the prompt, untouched
      expect(t, c.idea).toContain(`CORE IDEA (the user's own words): «${c.idea}»`);
      expect(t, c.idea).toMatch(c.en);
      // logo: mandatory, described, and nothing that makes ChatGPT ask for a file
      expect(t.split('MANDATORY BRAND LOGO:'), c.idea).toHaveLength(2);
      expect(t, c.idea).toContain('do not ask for a logo file');
      expect(t, c.idea).not.toMatch(/original official|placed over it afterwards|\.svg|\.png|provided with the project/);
      // the owner's instruction, verbatim and last
      expect(t.trimEnd().endsWith(EXECUTE), c.idea).toBe(true);
      expect(t.split('EXECUTE IMMEDIATELY:'), c.idea).toHaveLength(2);
      expect(t.indexOf('CONSTRAINTS — AVOID:')).toBeLessThan(t.indexOf('EXECUTE IMMEDIATELY:'));
      if (c.texts) expect(t).toContain(`only the exact text "${c.texts}"`);
      else expect(t).toContain('no text in the image — no captions, words or letters anywhere, except the name that is part of the logo itself');
    }
    await expect(page.getByTestId('ai-explanation')).toContainText('EXECUTE IMMEDIATELY');
    await expect(page.getByTestId('ai-explanation')).toContainText('لا يُجبر');
  });

  test('«حذف الوصف وبدء وصف جديد»: asks before losing an unsaved prompt, clears the request, keeps settings and identity', async ({ page }, info) => {
    test.skip(!['desktop-1440', 'phone-iphone-se'].includes(info.project.name), 'computer and the smallest phone');
    await disableSplash(page);
    await page.goto('./#/ai-studio');
    await page.getByTestId('ai-advanced-toggle').click();
    await page.getByTestId('ai-brand').selectOption({ label: 'IBRAHIM AI UNIVERSE' });
    await page.getByTestId('ai-style').selectOption({ index: 2 });
    const style = await page.getByTestId('ai-style').inputValue();
    await page.getByTestId('ai-idea').fill('طالب يدرس الرياضيات');
    await page.getByTestId('ai-texts').fill('مرحبا');
    await page.getByTestId('ai-generate').click();
    await expect(page.getByTestId('ai-prompt')).not.toHaveValue('');

    // unsaved → a confirmation; «إلغاء» keeps everything
    await page.getByTestId('ai-clear').click();
    const dlg = page.getByTestId('ai-clear-confirm');
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: 'إلغاء' }).click();
    await expect(page.getByTestId('ai-prompt')).not.toHaveValue('');
    await expect(page.getByTestId('ai-idea')).toHaveValue('طالب يدرس الرياضيات');

    await page.getByTestId('ai-clear').click();
    await dlg.getByRole('button', { name: 'حذف وبدء وصف جديد' }).click();
    await expect(page.getByTestId('ai-idea')).toHaveValue('');
    await expect(page.getByTestId('ai-texts')).toHaveValue('');
    await expect(page.getByTestId('ai-prompt')).toHaveCount(0); // result, negative prompt and explanation are gone
    await expect(page.getByTestId('ai-idea')).toBeFocused();
    // settings and identity stay
    await expect(page.getByTestId('ai-style')).toHaveValue(style);
    await expect(page.getByTestId('ai-brand')).toHaveValue('brand-ai-universe');

    // a saved prompt is cleared without asking, and stays in the library
    await page.getByTestId('ai-idea').fill('منشور تعليمي عن المدرسة');
    await page.getByTestId('ai-generate').click();
    await page.getByTestId('ai-save').click();
    await page.getByTestId('ai-clear').click();
    await expect(dlg).not.toBeVisible();
    await expect(page.getByTestId('ai-idea')).toHaveValue('');
    await page.getByTestId('ai-tab-library').click();
    await expect(page.getByTestId('ai-lib-item')).toHaveCount(1);
  });
});

test.describe('volume control 1.5.0', () => {
  test('mouse, click on the bar, keyboard, − / + : the value, the engine gain and the measured output all follow; 0 is silent; mute keeps the level', async ({ page }, info) => {
    test.skip(!['desktop-1440', 'laptop-1280'].includes(info.project.name), 'mouse sizes');
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await disableSplash(page);
    await page.goto('./#/settings');
    await page.getByTestId('music-play').click();
    await expect.poll(async () => (await audio(page)).transport).toBe('playing');
    const bar = page.getByTestId('music-volume');
    // nothing covers the bar
    const box = (await bar.boundingBox())!;
    expect(await page.evaluate(([x, y]) => (document.elementFromPoint(x, y) as HTMLElement | null)?.dataset.testid, [box.x + box.width / 2, box.y + box.height / 2])).toBe('music-volume');

    // the five levels, set by clicking on the bar (left = quiet, right = loud)
    const results: { v: number; gain: number; out: number }[] = [];
    for (const v of [0, 25, 50, 75, 100]) {
      const x = box.x + 10 + ((box.width - 20) * v) / 100; // the thumb travels between its half-widths
      await page.mouse.click(x, box.y + box.height / 2);
      const val = Number(await bar.inputValue());
      expect(Math.abs(val - v), `clicked at ${v}%`).toBeLessThanOrEqual(3);
      await expect(page.getByTestId('music-volume-value')).toHaveText(`${val}٪`);
      await page.waitForTimeout(400);
      results.push({ v, gain: (await audio(page)).gain, out: await level(page) });
    }
    console.log('VOLUME', JSON.stringify(results.map((r) => ({ v: r.v, gain: +r.gain.toFixed(3), out: +r.out.toFixed(4) }))));
    expect(results[0].gain).toBe(0);
    expect(results[0].out).toBeLessThan(0.002); // 0 % = silent
    for (let i = 1; i < results.length; i++) {
      expect(results[i].gain, `gain rises at ${results[i].v}%`).toBeGreaterThan(results[i - 1].gain);
      expect(results[i].out, `measured output rises at ${results[i].v}%`).toBeGreaterThan(results[i - 1].out);
    }
    expect(results[4].out / results[1].out).toBeGreaterThan(5); // 25 % → 100 % is a real change (it was ~2.5× before)

    // drag the thumb from the right end to the left quarter
    await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 8 });
    await page.mouse.move(box.x + 10 + (box.width - 20) * 0.25, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    expect(Math.abs(Number(await bar.inputValue()) - 25)).toBeLessThanOrEqual(3);

    // keyboard
    await bar.focus();
    await page.keyboard.press('End');
    await expect(bar).toHaveValue('100');
    await page.keyboard.press('ArrowLeft');
    await expect(bar).toHaveValue('99');
    await page.keyboard.press('Home');
    await expect(bar).toHaveValue('0');
    await expect.poll(async () => (await audio(page)).gain).toBe(0); // after the short 80 ms ramp
    // − / +
    await page.getByTestId('music-volume-up').click();
    await page.getByTestId('music-volume-up').click();
    await expect(bar).toHaveValue('20');
    await page.getByTestId('music-volume-down').click();
    await expect(bar).toHaveValue('10');
    await page.getByTestId('music-volume-up').click();
    await page.getByTestId('music-volume-up').click();
    await page.getByTestId('music-volume-up').click();
    await page.getByTestId('music-volume-up').click();
    await expect(bar).toHaveValue('50');
    await page.waitForTimeout(300);
    const at50 = (await audio(page)).gain;
    expect(at50).toBeGreaterThan(0);

    // mute keeps the level; unmute restores it
    await page.getByTestId('mute-all').check();
    await expect.poll(async () => (await audio(page)).gain).toBe(0);
    expect(await level(page)).toBeLessThan(0.002);
    await expect(bar).toHaveValue('50');
    await page.getByTestId('mute-all').uncheck();
    await page.waitForTimeout(400);
    expect((await audio(page)).gain).toBeCloseTo(at50, 3);

    // the level stays when changing page and is not reset by playing again
    await page.goto('./#/ai-studio');
    await page.goto('./#/settings');
    await expect(page.getByTestId('music-volume')).toHaveValue('50');
    expect((await audio(page)).gain).toBeCloseTo(at50, 3);
    await page.getByTestId('music-stop').click();
    await page.getByTestId('music-play').click();
    await page.waitForTimeout(2600);
    expect((await audio(page)).gain).toBeCloseTo(at50, 2);
    // screen reader
    await expect(bar).toHaveAttribute('aria-valuetext', '50٪');
    await expect(page.getByLabel('رفع مستوى صوت الموسيقى')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('touch: tapping the bar and the − / + buttons in the sound popover changes the playing music', async ({ page }, info) => {
    test.skip(!isPhone(info.project.name), 'phones');
    await disableSplash(page);
    await page.goto('./');
    await page.locator('[data-testid=sound-button]:visible').first().tap();
    const pop = page.getByTestId('sound-popover');
    await pop.getByTestId('music-play').tap();
    await expect.poll(async () => (await audio(page)).transport).toBe('playing');
    const bar = pop.getByTestId('music-volume');
    const box = (await bar.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.touchscreen.tap(box.x + 10 + (box.width - 20) * 0.9, box.y + box.height / 2);
    expect(Math.abs(Number(await bar.inputValue()) - 90)).toBeLessThanOrEqual(4);
    await page.waitForTimeout(400);
    const high = (await audio(page)).gain;
    await page.touchscreen.tap(box.x + 10 + (box.width - 20) * 0.2, box.y + box.height / 2);
    expect(Math.abs(Number(await bar.inputValue()) - 20)).toBeLessThanOrEqual(4);
    await page.waitForTimeout(400);
    const low = (await audio(page)).gain;
    expect(low).toBeLessThan(high);
    await pop.getByTestId('music-volume-up').tap();
    await page.waitForTimeout(300);
    expect((await audio(page)).gain).toBeGreaterThan(low);
  });
});

test.describe('content fields 1.5.0', () => {
  test('school / university / training: the right fields, free-text course and topic, saved and reopened intact; removed options are gone', async ({ page }, info) => {
    test.skip(!['desktop-1440', 'phone-iphone-se'].includes(info.project.name), 'computer and the smallest phone');
    test.setTimeout(120_000);
    await disableSplash(page);
    await page.goto('./#/projects');

    // school
    await page.getByTestId('new-project').click();
    const d = page.locator('dialog[open][data-testid=project-dialog]');
    await d.getByTestId('content-kind-school').click();
    const grades = await d.getByTestId('project-grade').locator('option').allTextContents();
    expect(grades).not.toContain('التعليم الجامعي');
    expect(grades).not.toContain('تدريب المعلمين');
    expect(grades).toContain('الصف السابع');
    const subjects = await d.locator('datalist option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
    expect(subjects).toContain('الرياضيات');
    expect(subjects).not.toContain('المناهج وطرق التدريس');
    const sem = await d.getByTestId('detail-semester').locator('option').allTextContents();
    expect(sem).toEqual(['غير محدد', 'الفصل الأول', 'الفصل الثاني', 'الفصل الصيفي']); // «العام كاملًا» removed
    await d.getByTestId('project-title').fill('وحدة الكسور');
    await d.getByTestId('project-subject').fill('الرياضيات');
    await d.getByTestId('project-grade').selectOption('الصف السابع');
    await d.getByTestId('detail-semester').selectOption('الفصل الثاني');
    await d.getByTestId('project-save').click();
    await expect(page.getByTestId('page-project')).toBeVisible();

    // university: course name typed freely, no school subject list
    await page.goto('./#/projects');
    await page.getByTestId('new-project').click();
    await d.getByTestId('content-kind-university').click();
    await expect(d.getByTestId('project-grade')).toHaveCount(0);
    expect(await d.getByTestId('project-subject').getAttribute('list')).toBeNull();
    await expect(d.getByTestId('project-subject')).toHaveAttribute('placeholder', /اسم المساق/);
    await d.getByTestId('project-title').fill('مساق متقدم');
    await d.getByTestId('project-subject').fill('مناهج البحث في تكنولوجيا التعليم (دكتوراه)');
    await d.getByTestId('detail-degree').selectOption('دكتوراه');
    await d.getByTestId('project-save').click();
    await expect(page.getByTestId('page-project')).toBeVisible();

    // training: topic typed freely
    await page.goto('./#/projects');
    await page.getByTestId('new-project').click();
    await d.getByTestId('content-kind-training').click();
    expect(await d.getByTestId('project-subject').getAttribute('list')).toBeNull();
    await d.getByTestId('project-title').fill('برنامج التقويم');
    await d.getByTestId('project-subject').fill('التقويم البديل في الصفوف الأساسية');
    await d.getByTestId('project-save').click();
    await expect(page.getByTestId('page-project')).toBeVisible();

    // reopen each for editing: every value is back where it belongs
    await page.reload();
    for (const [title, subject] of [
      ['وحدة الكسور', 'الرياضيات'],
      ['مساق متقدم', 'مناهج البحث في تكنولوجيا التعليم (دكتوراه)'],
      ['برنامج التقويم', 'التقويم البديل في الصفوف الأساسية'],
    ]) {
      await page.goto('./#/projects');
      await page.getByRole('link', { name: title }).first().click();
      await page.getByTestId('edit-project').click();
      await expect(d.getByTestId('project-title')).toHaveValue(title);
      await expect(d.getByTestId('project-subject')).toHaveValue(subject);
      if (title === 'وحدة الكسور') {
        await expect(d.getByTestId('project-grade')).toHaveValue('الصف السابع');
        await expect(d.getByTestId('detail-semester')).toHaveValue('الفصل الثاني');
      }
      if (title === 'مساق متقدم') await expect(d.getByTestId('detail-degree')).toHaveValue('دكتوراه');
      await d.getByTestId('project-save').click(); // saving again changes nothing
      await expect(d).toHaveCount(0);
    }
  });

  test('a value saved before 1.5.0 («العام كاملًا», a university stage) is kept, not deleted', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-1440', 'one size');
    await disableSplash(page);
    await page.goto('./#/projects');
    await page.evaluate(async () => {
      const open = indexedDB.open('ibrahi8m-edu');
      const db: IDBDatabase = await new Promise((ok) => (open.onsuccess = () => ok(open.result)));
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put({ id: 'old-p', title: 'محتوى قديم', subject: 'المناهج وطرق التدريس', grade: 'الصف الثامن', description: '', status: 'draft', tags: [], color: 'blue', kind: 'school', published: true, details: { semester: 'العام كاملًا' }, createdAt: 1, updatedAt: 1 });
      await new Promise((ok) => (tx.oncomplete = ok));
      db.close();
    });
    await page.goto('./#/projects/old-p');
    await page.getByTestId('edit-project').click();
    const d = page.locator('dialog[open][data-testid=project-dialog]');
    await expect(d.getByTestId('detail-semester')).toHaveValue('العام كاملًا');
    await expect(d.getByTestId('project-subject')).toHaveValue('المناهج وطرق التدريس');
    await d.getByTestId('project-description').fill('عُدّل');
    await d.getByTestId('project-save').click();
    await expect(d).toHaveCount(0);
    const kept = await page.evaluate(async () => {
      const open = indexedDB.open('ibrahi8m-edu');
      const db: IDBDatabase = await new Promise((ok) => (open.onsuccess = () => ok(open.result)));
      const r = db.transaction('projects').objectStore('projects').get('old-p');
      const v = await new Promise<{ details: { semester: string }; subject: string }>((ok) => (r.onsuccess = () => ok(r.result)));
      db.close();
      return v;
    });
    expect(kept.details.semester).toBe('العام كاملًا');
    expect(kept.subject).toBe('المناهج وطرق التدريس');
  });
});

test('«صاحب المشروع»: renamed, the owner’s name, phone, e-mail and English level; no «المراجع»; edits by the admin persist', async ({ page }, info) => {
  test.skip(!['desktop-1440', 'phone-pixel-7'].includes(info.project.name), 'computer and phone');
  await disableSplash(page);
  await page.goto('./#/me');
  await expect(page.getByTestId('page-me').getByRole('heading', { level: 1 }).first()).toHaveText('صاحب المشروع');
  await expect(page.getByTestId('owner-name')).toHaveText('إبراهيم سمير محمود الخطيب');
  await expect(page.getByTestId('owner-phone')).toHaveText('0592780728');
  await expect(page.getByTestId('owner-email')).toHaveText('ibrahimyasf@gmail.com');
  await expect(page.getByTestId('owner-english')).toHaveText('جيد');
  await expect(page.getByTestId('page-me')).not.toContainText('المراجع');
  await expect(page.getByTestId('page-me')).not.toContainText('صفحتي');
  await page.goto('./#/more');
  await expect(page.getByTestId('page-more')).toContainText('صاحب المشروع');
  await expect(page.getByTestId('page-more')).not.toContainText('صفحتي');
  await page.goto('./#/me');
  await page.getByTestId('cv-edit').click();
  await expect(page.getByTestId('cv-editor')).not.toContainText('المراجع');
  await page.getByTestId('cv-in-phone').fill('0592 780 728');
  await page.getByTestId('cv-save').click();
  await expect(page.getByTestId('toast').last()).toContainText('حُفظت السيرة الذاتية'); // the save is asynchronous
  await page.reload();
  await expect(page.getByTestId('owner-phone')).toHaveText('0592 780 728');
});
