import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { signedIn } from './signin';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const launch = (userData: string, downloads: string) =>
  electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, IBRAHI8M_USER_DATA: userData, IBRAHI8M_DOWNLOAD_DIR: downloads } });
const go = (w: Page, hash: string) => w.goto(`app://edu/index.html#${hash}`);

test('desktop app: a project is exported to an .ibm file with its Arabic name and imported into a second, empty installation; a full backup restores it too', async () => {
  test.setTimeout(150_000);
  const userA = mkdtempSync(join(tmpdir(), 'ibrahi8m-desktop-a-'));
  const userB = mkdtempSync(join(tmpdir(), 'ibrahi8m-desktop-b-'));
  const downloads = mkdtempSync(join(tmpdir(), 'ibrahi8m-desktop-dl-'));
  const day = new Date().toISOString().slice(0, 10);

  // ── installation A: a project with a lesson, exported and backed up ──
  const app1 = await launch(userA, downloads);
  const w1 = await app1.firstWindow();
  await signedIn(w1);
  await expect(w1.getByTestId('page-dashboard')).toBeVisible({ timeout: 10_000 });
  await go(w1, '/settings');
  await w1.getByTestId('toggle-splash').uncheck();
  await go(w1, '/projects');
  await w1.getByTestId('new-project').click();
  await w1.getByTestId('project-title').fill('وحدة الطاقة');
  await w1.getByTestId('project-save').click();
  await expect(w1.getByTestId('project-heading')).toHaveText('وحدة الطاقة');
  await w1.getByTestId('new-lesson').first().click();
  await w1.getByTestId('lesson-title').fill('مصادر الطاقة');
  await w1.getByTestId('lesson-save').click();
  await expect(w1.getByTestId('lesson-dialog')).toBeHidden();

  await go(w1, '/backup');
  await w1.getByTestId('export-project-select').selectOption({ label: 'وحدة الطاقة' });
  await w1.getByTestId('export-project').click();
  const projectFile = join(downloads, `وحدة الطاقة ${day}.ibm`);
  await expect(w1.getByText(`صُدّر المشروع إلى «وحدة الطاقة ${day}.ibm»`, { exact: false })).toBeVisible();
  await expect.poll(() => existsSync(projectFile), { timeout: 10_000 }).toBe(true);
  await w1.getByTestId('create-backup').click();
  await expect.poll(() => readdirSync(downloads).filter((f) => f.endsWith('.ibm')).length, { timeout: 10_000 }).toBe(2);
  const backupFile = join(downloads, readdirSync(downloads).find((f) => f.endsWith('.ibm') && f !== `وحدة الطاقة ${day}.ibm`)!);
  await app1.close();

  // ── installation B (empty): import the project file ──
  const app2 = await launch(userB, downloads);
  const w2 = await app2.firstWindow();
  await signedIn(w2);
  await go(w2, '/backup');
  await w2.getByTestId('import-file').setInputFiles(projectFile);
  await expect(w2.getByTestId('import-preview')).toHaveAttribute('data-kind', 'project');
  await w2.getByTestId('import-apply').click();
  await expect(w2.getByTestId('import-result')).toBeVisible();
  await go(w2, '/projects');
  await w2.getByRole('link', { name: /وحدة الطاقة/ }).first().click();
  await expect(w2.getByText('مصادر الطاقة').first()).toBeVisible();
  await app2.close();

  // ── installation C (empty): restore the full backup, then reopen ──
  const userC = mkdtempSync(join(tmpdir(), 'ibrahi8m-desktop-c-'));
  const app3 = await launch(userC, downloads);
  const w3 = await app3.firstWindow();
  await signedIn(w3);
  await go(w3, '/backup');
  await w3.getByTestId('import-file').setInputFiles(backupFile);
  await expect(w3.getByTestId('import-preview')).toHaveAttribute('data-kind', 'backup');
  await w3.getByTestId('import-apply').click();
  await expect(w3.getByTestId('import-result')).toBeVisible();
  await w3.screenshot({ path: 'docs/screenshots/desktop-app/import-backup.png' });
  await app3.close();
  const app4 = await launch(userC, downloads);
  const w4 = await app4.firstWindow();
  await signedIn(w4);
  await go(w4, '/projects');
  await w4.getByRole('link', { name: /وحدة الطاقة/ }).first().click();
  await expect(w4.getByText('مصادر الطاقة').first()).toBeVisible();
  await app4.close();
});
