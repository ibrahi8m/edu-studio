import { expect, test } from '@playwright/test';
import { copyFileSync, mkdirSync } from 'node:fs';
import { launchProfile, newProfileDir } from './helpers';
import { disableSplash } from './quiz-helpers';

/**
 * Phase 8 delivery: the plan's «ملف demo.ibm يحتوي المحتوى التجريبي، يُستورد بضغطة واحدة».
 * The file is made BY THE APP (add the demo, export it with results) and then imported into an
 * empty device. The result is release/delivery/demo.ibm, the file that is delivered.
 */
test('make demo.ibm with the app, then import it with one action into an empty device', async ({}, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'the delivery file is made once');
  test.setTimeout(180_000);
  const a = await launchProfile(newProfileDir(), info);
  const p = a.pages()[0] ?? (await a.newPage());
  await disableSplash(p);
  await p.getByTestId('demo-panel').getByTestId('demo-install').click();
  await expect(p.getByTestId('demo-panel')).toHaveAttribute('data-installed', 'true', { timeout: 15_000 });
  await p.goto('./#/backup?export=demo-project-digital-safety');
  await p.getByTestId('export-include-results').check();
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByTestId('export-project').click()]);
  mkdirSync('release/delivery', { recursive: true });
  copyFileSync(await dl.path(), 'release/delivery/demo.ibm');
  await a.close();

  const b = await launchProfile(newProfileDir(), info);
  const q = b.pages()[0] ?? (await b.newPage());
  await disableSplash(q);
  await q.goto('./#/backup');
  await q.getByTestId('import-file').setInputFiles('release/delivery/demo.ibm');
  await expect(q.getByTestId('import-preview')).toHaveAttribute('data-kind', 'project');
  await q.getByTestId('import-apply').click();
  await expect(q.getByTestId('import-result')).toBeVisible();
  await q.goto('./#/projects/demo-project-digital-safety');
  await expect(q.getByTestId('lesson-row')).toHaveCount(3);
  await expect(q.getByTestId('demo-badge').first()).toBeVisible();
  await q.goto('./#/results');
  await expect(q.getByTestId('student-row')).toHaveCount(10);
  await b.close();
});
