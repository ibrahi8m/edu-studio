import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const launch = (userData: string) =>
  electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, IBRAHI8M_USER_DATA: userData } });

test('desktop app runs from disk, blocks the network and keeps settings, projects, lessons, lesson content and images across restarts', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ibrahi8m-desktop-'));

  // First launch: no service worker, no server, files come from dist/ on disk.
  const app1 = await launch(userData);
  const w1 = await app1.firstWindow();
  expect(w1.url()).toBe('app://edu/index.html');
  await expect(w1.getByTestId('splash')).toBeVisible();
  await expect(w1.getByTestId('splash')).toBeHidden({ timeout: 6000 });
  await expect(w1.getByTestId('page-dashboard')).toBeVisible();
  expect(await w1.evaluate(() => window.ibrahi8mDesktop?.platform)).toBeTruthy();
  await expect(w1.getByTestId('status-offline')).toContainText('نسخة سطح المكتب');

  // Any attempt to reach the internet is refused.
  const blocked = await w1.evaluate(async () => {
    try {
      await fetch('https://example.com/');
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);

  const fonts = await w1.evaluate(async () => {
    await document.fonts.ready;
    return [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))];
  });
  expect(fonts).toContain('IBM Plex Sans Arabic');
  const broken = await w1.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length);
  expect(broken).toBe(0);
  await w1.screenshot({ path: 'docs/screenshots/desktop-app/dashboard.png' });

  await w1.goto('app://edu/index.html#/settings');
  await w1.getByRole('radio', { name: 'فاتح' }).click();
  await w1.goto('app://edu/index.html#/me');
  const f = w1.getByTestId('profile-userOrganization');
  await f.fill('جامعة — اختبار سطح المكتب');
  await f.blur();
  await expect(w1.getByText('تم الحفظ')).toBeVisible();

  // Phase 1: a project with lessons, written to the desktop app's own database
  await w1.goto('app://edu/index.html#/projects');
  await w1.getByTestId('new-project').click();
  await w1.getByTestId('project-title').fill('مشروع سطح المكتب');
  await w1.getByTestId('project-subject').fill('العلوم');
  await w1.getByTestId('project-save').click();
  await expect(w1.getByTestId('project-heading')).toHaveText('مشروع سطح المكتب');
  for (const t of ['الدرس الأول', 'الدرس الثاني']) {
    await w1.getByTestId('new-lesson').first().click();
    await w1.getByTestId('lesson-title').fill(t);
    await w1.getByTestId('lesson-save').click();
    await expect(w1.getByTestId('lesson-dialog')).toBeHidden();
  }

  // Phase 2: lesson editor with an objective and a local image
  await w1.getByRole('button', { name: 'فتح محرر الدرس: الدرس الأول' }).click();
  await w1.getByTestId('add-objective').click();
  await w1.getByRole('radio', { name: '1 التذكر' }).click();
  await w1.getByTestId('verb-bank').getByRole('button', { name: 'يعدّد', exact: true }).click();
  await w1.getByTestId('objective-content').fill('مصادر الطاقة');
  await w1.getByTestId('tab-content').click();
  await w1.getByTestId('add-block').click();
  await w1.getByTestId('add-image').click();
  await w1.getByTestId('image-input').setInputFiles(resolve('tests/fixtures/energy-diagram.png'));
  await expect(w1.getByTestId('image-preview')).toBeVisible();
  await w1.waitForTimeout(150);
  await expect(w1.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });
  const editorHash = new URL(w1.url()).hash;
  await app1.close();

  // Second launch: data is still there.
  const app2 = await launch(userData);
  const w2 = await app2.firstWindow();
  await expect(w2.getByTestId('page-dashboard')).toBeVisible({ timeout: 8000 });
  await expect.poll(() => w2.evaluate(() => document.documentElement.dataset.theme), { timeout: 5000 }).toBe('light');
  await w2.goto('app://edu/index.html#/me');
  await expect(w2.getByText('جامعة — اختبار سطح المكتب').first()).toBeVisible();
  await w2.goto('app://edu/index.html#/about');
  await w2.screenshot({ path: 'docs/screenshots/desktop-app/about-light.png' });
  await w2.goto('app://edu/index.html#/projects');
  await w2.getByTestId('project-card').first().click();
  await expect(w2.getByTestId('project-heading')).toHaveText('مشروع سطح المكتب');
  await expect(w2.getByTestId('project-lessons').locator('.lesson-title')).toHaveText(['الدرس الأول', 'الدرس الثاني']);
  await w2.screenshot({ path: 'docs/screenshots/desktop-app/project.png' });
  await w2.goto(`app://edu/index.html${editorHash}`);
  await w2.getByTestId('tab-plan').click();
  await expect(w2.getByTestId('objective-statement')).toHaveText('أن يعدّد الطالب مصادر الطاقة.');
  await w2.getByTestId('tab-content').click();
  await expect.poll(() => w2.getByTestId('image-preview').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1600);
  await w2.getByTestId('open-preview').click();
  await expect.poll(() => w2.getByTestId('lv-image').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1600);
  await w2.screenshot({ path: 'docs/screenshots/desktop-app/preview.png' });
  await app2.close();
});
