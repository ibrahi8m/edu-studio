import { expect, test } from '@playwright/test';
import { settleAfterAdd } from './helpers';
import { chooseStudent, disableSplash, isPhone, lessonWithObjectives, waitSaved } from './quiz-helpers';

/** 1.1.0, phones: authoring with a file and an assignment, then learning, entirely by touch. */
test('phones: attach a file and an assignment in the lesson editor by touch; the learner downloads the file and saves a draft', async ({ page }, info) => {
  test.skip(!isPhone(info.project.name), 'phone sizes only');
  await disableSplash(page);
  await lessonWithObjectives(page);
  await page.getByTestId('tab-content').tap();
  for (const [type, fill] of [
    ['heading', async () => page.getByTestId('block').last().getByTestId('heading-text').fill('ورقة العمل')],
    ['file', async () => {
      const b = page.getByTestId('block').last();
      await b.getByTestId('file-input').setInputFiles({ name: 'ورقة-عمل.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% test\n') });
      await expect(page.getByTestId('toast').last()).toContainText('حُفظ الملف');
      await b.getByTestId('file-title').fill('ورقة عمل الطاقة');
    }],
    ['activity', async () => {
      const b = page.getByTestId('block').last();
      await b.getByTestId('activity-title').fill('حل ورقة العمل');
      await b.getByTestId('activity-submit').tap();
    }],
  ] as const) {
    await page.getByTestId('add-block').last().tap();
    await page.getByTestId(`add-${type}`).tap();
    await expect(page.getByTestId('add-block-dialog')).toBeHidden();
    await settleAfterAdd(page);
    await fill();
  }
  // a disallowed file is refused with a message
  await page.getByTestId('block').nth(-2).getByTestId('file-input').setInputFiles({ name: 'x.bat', mimeType: 'text/plain', buffer: Buffer.from('echo') });
  await expect(page.getByTestId('toast').last()).toContainText('غير مسموح');
  await waitSaved(page);
  const [scrollW, vw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollW).toBeLessThanOrEqual(vw);

  await chooseStudent(page, 'هالة');
  await page.getByTestId('open-lesson').first().tap();
  await page.getByTestId('lp-next').tap();
  await expect(page.getByTestId('lv-file')).toContainText('ورقة عمل الطاقة');
  const dl = page.waitForEvent('download');
  await page.getByTestId('lv-file-download').tap();
  expect((await dl).suggestedFilename()).toBe('ورقة-عمل.pdf');
  await page.getByTestId('assign-answer').fill('حللت الورقة.');
  await page.getByTestId('assign-save-draft').tap();
  await expect(page.getByTestId('assign-state')).toHaveText('مسودة');
  const box = await page.getByTestId('assign-submit').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(40);
  await page.reload();
  await expect(page.getByTestId('assign-answer')).toHaveValue('حللت الورقة.');
});
