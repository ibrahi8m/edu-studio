import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchProfile, newProfileDir, primeOffline, settleAfterAdd, watchNetwork } from './helpers';
import { addQuestion, chooseStudent, common, disableSplash, lessonWithObjectives, newQuiz, quizRow, waitSaved } from './quiz-helpers';

const FX = (f: string) => fileURLToPath(new URL(`../fixtures/${f}`, import.meta.url));

/**
 * Everything in the local database, read straight from IndexedDB, with each media file
 * replaced by its SHA-256 — the plan's acceptance compares data and media by hash.
 */
async function dbSnapshot(page: Page) {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok, fail) => {
      const r = indexedDB.open('ibrahi8m-edu');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
    const stores = ['projects', 'lessons', 'lessonDocs', 'assets', 'quizzes', 'attempts', 'progress', 'designs', 'library'];
    const out: Record<string, unknown[]> = {};
    for (const s of stores) {
      const rows: Record<string, unknown>[] = await new Promise((ok, fail) => {
        const r = db.transaction(s).objectStore(s).getAll();
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fail(r.error);
      });
      if (s === 'assets')
        for (const a of rows) {
          const h = await crypto.subtle.digest('SHA-256', a.data as ArrayBuffer);
          a.data = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
        }
      out[s] = rows.sort((x, y) => String(x.id ?? x.lessonId).localeCompare(String(y.id ?? y.lessonId)));
    }
    db.close();
    return out;
  });
}

const counts = (s: Record<string, unknown[]>) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.length]));

/** A complete project through the UI: 1 lesson with 2 objectives and a stored image, a quiz taken by a student, a concept map. */
async function buildProject(page: Page) {
  await lessonWithObjectives(page); // «وحدة الطاقة» / «مصادر الطاقة», editor open
  await page.getByTestId('tab-content').click();
  await page.getByTestId('add-block').last().click();
  await page.getByTestId('add-image').click();
  await settleAfterAdd(page);
  await page.getByTestId('image-input').setInputFiles(FX('energy-diagram.png'));
  await expect(page.getByTestId('image-preview')).toBeVisible();
  await page.getByTestId('image-alt').fill('مخطط الطاقة');
  await waitSaved(page);
  await newQuiz(page, 'اختبار الطاقة');
  const c = await addQuestion(page, 'truefalse');
  await common(c, { prompt: 'الشمس مصدر متجدد.', points: '1', feedbackBad: 'الشمس لا تنفد.', objectives: [0] });
  await c.getByTestId('tf-true').click();
  await waitSaved(page);
  await chooseStudent(page, 'سلمى');
  await quizRow(page, 'اختبار الطاقة').getByTestId('student-quiz-go').click();
  await page.getByTestId('take-start').click();
  await page.getByTestId('take-true').check();
  await page.getByTestId('take-to-review').click();
  await page.getByTestId('take-submit').click();
  await expect(page.getByTestId('result-score')).toHaveText('1 / 1');
  await page.goto('./#/studio');
  await page.getByTestId('new-design').click();
  await page.getByTestId('design-title-input').fill('خريطة الطاقة');
  await page.getByTestId('design-project-select').selectOption({ label: 'وحدة الطاقة' });
  await page.getByTestId('create-design-save').click();
  await expect(page.getByTestId('map-node')).toHaveCount(1);
  await waitSaved(page);
}

async function exportProject(page: Page, file: string, withResults: boolean) {
  await page.goto('./#/backup');
  await page.getByTestId('export-project-select').selectOption({ label: 'وحدة الطاقة' });
  if (withResults) await page.getByTestId('export-include-results').check();
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-project').click();
  const d = await dl;
  expect(d.suggestedFilename()).toMatch(/^وحدة الطاقة \d{4}-\d{2}-\d{2}\.ibm$/);
  await d.saveAs(file);
  await expect(page.getByText(/صُدّر المشروع إلى «وحدة الطاقة/)).toBeVisible();
}

async function pickFile(page: Page, file: string) {
  await page.goto('./#/backup');
  await page.getByTestId('import-file').setInputFiles(file);
}

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);

async function fits(page: Page, label: string) {
  const vw = page.viewportSize()!.width;
  const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollW, `horizontal overflow: ${label}`).toBeLessThanOrEqual(vw);
  expect(innerW, `zoomed out: ${label}`).toBe(vw);
}

test.describe('Phase 6 — import and export', () => {
  test.beforeEach(async ({ page }) => {
    await disableSplash(page);
  });

  test('ACCEPTANCE: export a project, delete it, import it — every record and every media file identical (SHA-256); importing again duplicates nothing', async ({ page }, info) => {
    test.setTimeout(300_000);
    const shots = `docs/screenshots/${info.project.name}`;
    await buildProject(page);
    const before = await dbSnapshot(page);
    expect(counts(before)).toMatchObject({ projects: 1, lessons: 1, lessonDocs: 1, assets: 1, quizzes: 1, attempts: 1, progress: 0, designs: 1 });
    const file = `test-results/${info.project.name}-project.ibm`;
    await exportProject(page, file, true);
    await fits(page, 'transfer page');
    expect(await serious(page), 'transfer page').toEqual([]);
    await page.screenshot({ path: `${shots}/p6-transfer.png`, fullPage: true });

    // the file is a ZIP with manifest.json, data.json and the image, its hash listed
    const zip = unzipSync(readFileSync(file));
    const manifest = JSON.parse(strFromU8(zip['manifest.json']));
    expect(manifest).toMatchObject({ format: 'ibrahi8m-edu', formatVersion: 1, kind: 'project', schemaVersion: 7, includesResults: true, counts: { lessons: 1, quizzes: 1, attempts: 1, designs: 1, assets: 1 } });
    const data = JSON.parse(strFromU8(zip['data.json']));
    const asset = data.assets[0];
    expect(createHash('sha256').update(zip[asset.path]).digest('hex')).toBe(asset.sha256);
    expect(asset.sha256).toBe((before.assets[0] as { data: string }).data);

    // delete the project (and with it its lesson, image, quiz, attempt, design)
    await page.goto('./#/projects');
    await page.getByTestId('project-card').first().click();
    await page.getByTestId('delete-project').click();
    await page.getByTestId('confirm-delete-project').getByRole('button', { name: /حذف/ }).click();
    await expect(page.getByTestId('page-projects')).toBeVisible();
    expect(counts(await dbSnapshot(page))).toMatchObject({ projects: 0, lessons: 0, assets: 0, quizzes: 0, attempts: 0, designs: 0 });

    // import: checked, previewed, then written
    await pickFile(page, file);
    const preview = page.getByTestId('import-preview');
    await expect(preview).toHaveAttribute('data-kind', 'project');
    await expect(preview.getByTestId('import-counts')).toContainText('1 مشروع · 1 درس · 1 اختبار · 1 تصميم · 1 ملف وسائط');
    await expect(preview.getByTestId('import-project')).toHaveAttribute('data-state', 'none');
    await expect(preview.getByTestId('import-choice')).toHaveValue('add');
    await fits(page, 'import preview');
    expect(await serious(page), 'import preview').toEqual([]);
    await page.screenshot({ path: `${shots}/p6-import-preview.png`, fullPage: true });
    await page.getByTestId('import-apply').click();
    await expect(page.getByTestId('import-result-text')).toContainText('أُضيف 1 مشروع · 1 درس · 1 اختبار · 1 تصميم · 1 ملف وسائط · 1 محاولة');
    expect(await dbSnapshot(page)).toEqual(before);

    // and it works: the lesson image shows, the result is there
    await page.getByRole('link', { name: 'فتح المشروع' }).click();
    await page.getByRole('button', { name: 'فتح محرر الدرس: مصادر الطاقة' }).click();
    await page.getByTestId('tab-content').click();
    await expect.poll(() => page.getByTestId('image-preview').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(1600);
    await page.goto('./#/results');
    await expect(page.getByTestId('student-row')).toContainText('سلمى');

    // importing the same file again: «already here», skipped by default → nothing duplicated
    await pickFile(page, file);
    await expect(preview.getByTestId('import-project')).toHaveAttribute('data-state', 'same');
    await expect(preview.getByTestId('import-choice')).toHaveValue('skip');
    await expect(page.getByTestId('import-apply')).toBeDisabled();
    expect(await dbSnapshot(page)).toEqual(before);
  });

  test('replace asks for confirmation and restores the exported version; a separate copy keeps the original; nothing is changed without confirming', async ({ page }, info) => {
    test.setTimeout(300_000);
    await buildProject(page);
    const file = `test-results/${info.project.name}-project2.ibm`;
    await exportProject(page, file, false);
    const exported = await dbSnapshot(page);
    // change the project after exporting
    await page.goto('./#/projects');
    await page.getByTestId('project-card').first().click();
    await page.getByTestId('new-lesson').first().click();
    await page.getByTestId('lesson-title').fill('درس أُضيف بعد التصدير');
    await page.getByTestId('lesson-save').click();
    await expect(page.getByTestId('lesson-dialog')).toBeHidden();

    // replace: confirmation lists what will be removed; cancelling changes nothing
    await pickFile(page, file);
    await page.getByTestId('import-choice').selectOption('replace');
    await page.getByTestId('import-apply').click();
    const dlg = page.getByTestId('confirm-import');
    await expect(dlg).toContainText('«وحدة الطاقة» — على الجهاز الآن: 2 درس، 1 محاولة');
    await dlg.getByRole('button', { name: 'إلغاء' }).click();
    expect(counts(await dbSnapshot(page))).toMatchObject({ lessons: 2, attempts: 1 });
    await page.getByTestId('import-apply').click();
    await dlg.getByRole('button', { name: 'نعم، استبدل' }).click();
    await expect(page.getByTestId('import-result-text')).toContainText('استُبدل 1');
    const replaced = await dbSnapshot(page);
    // exported without results: the project is back as exported, its results are gone with the replaced copy
    expect(replaced.lessons).toEqual(exported.lessons);
    expect(replaced.assets).toEqual(exported.assets);
    expect(replaced.quizzes).toEqual(exported.quizzes);
    expect(replaced.designs).toEqual(exported.designs);
    expect(replaced.attempts).toEqual([]);

    // a separate copy: new identifiers, «(نسخة مستوردة)», the original untouched
    await pickFile(page, file);
    await page.getByTestId('import-choice').selectOption('copy');
    await page.getByTestId('import-apply').click();
    await expect(page.getByTestId('import-result-text')).toContainText('أُضيفت 1 نسخة منفصلة');
    const after = await dbSnapshot(page);
    expect(counts(after)).toMatchObject({ projects: 2, lessons: 2, assets: 2, quizzes: 2, designs: 2 });
    expect((after.projects as { title: string }[]).map((p) => p.title).sort()).toEqual(['وحدة الطاقة', 'وحدة الطاقة (نسخة مستوردة)']);
    expect((after.assets as { data: string }[])[0].data).toBe((after.assets as { data: string }[])[1].data);
    await page.goto('./#/projects');
    await expect(page.getByTestId('project-card')).toHaveCount(2);
  });

  test('damaged, foreign, newer and older files are handled with clear messages; nothing is written', async ({ page }, info) => {
    test.setTimeout(300_000);
    await buildProject(page);
    const good = `test-results/${info.project.name}-good.ibm`;
    await exportProject(page, good, false);
    const before = await dbSnapshot(page);
    const dir = `test-results/${info.project.name}`;
    const parts = unzipSync(readFileSync(good));
    const manifest = JSON.parse(strFromU8(parts['manifest.json']));
    const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
    const cases: [string, Uint8Array, RegExp][] = [
      ['text.ibm', strToU8('هذا ملف نصي وليس مشروعًا'), /ليس ملف مشروع أو نسخة احتياطية/],
      ['other.ibm', zipSync({ 'notes.txt': strToU8('x') }), /ليس من IBRAHI8M EDU STUDIO/],
      ['newer.ibm', zipSync({ ...parts, 'manifest.json': strToU8(JSON.stringify({ ...manifest, schemaVersion: 99, appVersion: '2.0.0' })) }), /أُنشئ هذا الملف بإصدار أحدث من التطبيق \(2\.0\.0\)/],
      ['cut.ibm', readFileSync(good).subarray(0, Math.floor(readFileSync(good).length / 2)), /تالف|ليس من IBRAHI8M/],
    ];
    const assetPath = Object.keys(parts).find((k) => k.startsWith('assets/'))!;
    const bad = parts[assetPath].slice();
    bad[100] ^= 0xff;
    cases.push(['image.ibm', zipSync({ ...parts, [assetPath]: bad }), /ملف الوسائط «.+» لا يطابق بصمته/]);
    for (const [name, bytes, msg] of cases) {
      const f = `${dir}-${name}`;
      writeFileSync(f, bytes);
      await pickFile(page, f);
      await expect(page.getByTestId('import-error'), name).toContainText(msg);
      await expect(page.getByTestId('import-preview')).toHaveCount(0);
    }
    expect(await dbSnapshot(page)).toEqual(before);
    await fits(page, 'import error');
    expect(await serious(page), 'import error').toEqual([]);

    // an older file (made when the database was v4: no designs table) is read, converted, and says so
    const data = JSON.parse(strFromU8(parts['data.json']));
    delete data.designs;
    delete data.progress;
    delete data.library;
    const json = strToU8(JSON.stringify(data));
    const old = `${dir}-old.ibm`;
    writeFileSync(old, zipSync({ ...parts, 'data.json': json, 'manifest.json': strToU8(JSON.stringify({ ...manifest, schemaVersion: 4, appVersion: '0.4.0', dataSha256: sha(json) })) }));
    await pickFile(page, old);
    await expect(page.getByTestId('import-warnings')).toContainText('الملف من إصدار أقدم (0.4.0)');
    await page.getByTestId('import-choice').selectOption('copy');
    await page.getByTestId('import-apply').click();
    await expect(page.getByTestId('import-result-text')).toContainText('أُضيفت 1 نسخة منفصلة · 1 درس · 1 اختبار · 0 تصميم');
  });

  test('a project with a large media file (50 MB) is exported and imported intact', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-1440', 'Memory-heavy; the format and code path are the same on every screen size.');
    test.setTimeout(300_000);
    await lessonWithObjectives(page);
    // a 50 MB video stored directly (a real camera clip is not available in this environment)
    await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((ok) => {
        const r = indexedDB.open('ibrahi8m-edu');
        r.onsuccess = () => ok(r.result);
      });
      const lesson: { id: string } = await new Promise((ok) => {
        const r = db.transaction('lessons').objectStore('lessons').getAll();
        r.onsuccess = () => ok(r.result[0]);
      });
      const data = new Uint8Array(50 * 1024 * 1024);
      for (let i = 0; i < data.length; i += 4096) crypto.getRandomValues(data.subarray(i, i + 4096));
      await new Promise((ok) => {
        const t = db.transaction('assets', 'readwrite');
        t.objectStore('assets').put({ id: 'big-video', lessonId: lesson.id, kind: 'video', mime: 'video/mp4', name: 'محاضرة.mp4', size: data.byteLength, data: data.buffer, createdAt: Date.now() });
        t.oncomplete = ok;
      });
      db.close();
    });
    const before = await dbSnapshot(page);
    const file = `test-results/${info.project.name}-big.ibm`;
    await exportProject(page, file, false);
    expect(readFileSync(file).length).toBeGreaterThan(50 * 1024 * 1024);
    await page.goto('./#/projects');
    await page.getByTestId('project-card').first().click();
    await page.getByTestId('delete-project').click();
    await page.getByTestId('confirm-delete-project').getByRole('button', { name: /حذف/ }).click();
    await expect(page.getByTestId('page-projects')).toBeVisible();
    await pickFile(page, file);
    await expect(page.getByTestId('import-counts')).toContainText('50 م.ب');
    await page.getByTestId('import-apply').click();
    await expect(page.getByTestId('import-result')).toBeVisible({ timeout: 60_000 });
    expect(await dbSnapshot(page)).toEqual(before);
  });

  test('full backup offline: made on one device, restored on another (merge, then replace everything with confirmation); survives restart', async ({}, testInfo) => {
    test.setTimeout(400_000);
    const base = String(testInfo.project.use.baseURL);
    // ── device A: data + settings, backup offline ──
    const dirA = newProfileDir();
    const a = await launchProfile(dirA, testInfo);
    const pa = a.pages()[0] ?? (await a.newPage());
    await primeOffline(pa);
    await disableSplash(pa);
    await a.setOffline(true);
    const netA = watchNetwork(pa, base);
    await buildProject(pa);
    await pa.goto('./#/settings');
    await pa.getByRole('radio', { name: 'فاتح' }).click();
    await pa.goto('./#/backup');
    await expect(pa.getByTestId('backup-due')).toContainText('لم تُنشأ أي نسخة احتياطية بعد.');
    const dl = pa.waitForEvent('download');
    await pa.getByTestId('create-backup').click();
    const file = `test-results/${testInfo.project.name}-backup.ibm`;
    await (await dl).saveAs(file);
    await expect(pa.getByTestId('last-backup')).toContainText('الآن');
    await expect(pa.getByTestId('backup-due')).toHaveCount(0);
    const stateA = await dbSnapshot(pa);
    expect(netA.external).toEqual([]);
    await a.close();

    // ── device B: its own project; merge keeps it and adds A's ──
    const dirB = newProfileDir();
    const b = await launchProfile(dirB, testInfo);
    const pb = b.pages()[0] ?? (await b.newPage());
    await primeOffline(pb);
    await disableSplash(pb);
    await b.setOffline(true);
    const netB = watchNetwork(pb, base);
    await pb.goto('./#/projects');
    await pb.getByTestId('new-project').click();
    await pb.getByTestId('project-title').fill('مشروع الجهاز الثاني');
    await pb.getByTestId('project-save').click();
    await expect(pb.getByTestId('project-heading')).toHaveText('مشروع الجهاز الثاني');
    await pickFile(pb, file);
    await expect(pb.getByTestId('import-preview')).toHaveAttribute('data-kind', 'backup');
    await expect(pb.getByTestId('mode-merge')).toBeChecked();
    await pb.getByTestId('import-apply').click();
    await expect(pb.getByTestId('import-result-text')).toContainText('أُضيف 1 مشروع');
    const merged = await dbSnapshot(pb);
    expect((merged.projects as { title: string }[]).map((p) => p.title).sort()).toEqual(['مشروع الجهاز الثاني', 'وحدة الطاقة']);
    expect(merged.assets).toEqual(stateA.assets);
    expect(merged.attempts).toEqual(stateA.attempts);
    // settings of B are kept in merge mode
    expect(await pb.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

    // replace everything: needs the checkbox and a confirmation
    await pickFile(pb, file);
    await pb.getByTestId('mode-replace-all').check();
    await expect(pb.getByTestId('replace-all-warning')).toContainText('سيُحذف من هذا الجهاز: 2 مشروع');
    await expect(pb.getByTestId('import-apply')).toBeDisabled();
    await pb.getByTestId('replace-all-understood').check();
    await pb.getByTestId('import-apply').click();
    await pb.getByTestId('confirm-import').getByRole('button', { name: 'نعم، استبدل كل البيانات' }).click();
    await expect(pb.getByTestId('import-result')).toBeVisible();
    expect(await dbSnapshot(pb)).toEqual(stateA);
    await b.close();

    // restart B offline: still identical, theme from the backup applied
    const b2 = await launchProfile(dirB, testInfo);
    await b2.setOffline(true);
    const p2 = b2.pages()[0] ?? (await b2.newPage());
    const errors: string[] = [];
    p2.on('pageerror', (e) => errors.push(String(e)));
    await p2.goto('./#/');
    await expect(p2.getByTestId('page-dashboard')).toBeVisible();
    await expect.poll(() => p2.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
    expect(await dbSnapshot(p2)).toEqual(stateA);
    expect(netB.external).toEqual([]);
    expect(errors).toEqual([]);
    await b2.close();
  });
});
