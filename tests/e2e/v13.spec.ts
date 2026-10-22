import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { disableSplash, isPhone } from './quiz-helpers';

/** 1.3.0 — the owner's original logo is a mandatory part of every prompt, and can be composited exactly. */

const MARK = 'MANDATORY BRAND LOGO:';
const CORE = [
  "Include the user's original official IBRAHI8M brand logo in the final design.",
  'The logo is a required element and must never be omitted.',
  'Use the exact original logo asset provided with the project (ibrahi8m-mark.svg).',
  'Do not redraw, regenerate, reinterpret, distort, crop, recolor, or replace the logo.',
  'Keep it unobstructed and readable.',
  'overlay the original logo asset onto the final image using an image compositing method.',
];
const FX = (f: string) => fileURLToPath(new URL(`../fixtures/${f}`, import.meta.url));
const heavy = (name: string) => ['desktop-1440', 'phone-pixel-7'].includes(name);
const hasLogo = (t: string) => {
  expect(t).toContain(MARK);
  for (const c of CORE) expect(t).toContain(c);
  expect(t.split(MARK)).toHaveLength(2);
};
const clip = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

test('the three examples: the English prompt box itself ends with the logo instructions; copy, TXT, save, regenerate, duplicate and editing keep them', async ({ page, context }, info) => {
  test.skip(!heavy(info.project.name), 'one computer and one phone size');
  test.setTimeout(150_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await disableSplash(page);
  await page.goto('./#/ai-studio');
  const box = page.getByTestId('ai-prompt');

  for (const [idea, type, title] of [
    ['رجل يلعب كرة بين الخيام', 'campaign', 'كرة بين الخيام'],
    ['إعلان تعليمي عن الأمن الرقمي للطلاب', 'educational', 'إعلان تعليمي'],
    ['تصميم معماري لمدرسة حديثة بفناء أخضر', 'architecture', 'تصميم معماري'],
  ]) {
    await page.getByTestId('ai-idea').fill(idea);
    await page.getByTestId('ai-type').selectOption(type);
    await page.getByTestId('ai-generate').click();
    // in the box that is copied — no option was touched
    hasLogo(await box.inputValue());

    await page.getByTestId('ai-copy').click();
    hasLogo(await clip(page));
    expect(await clip(page)).toBe(await box.inputValue());

    const dl = page.waitForEvent('download');
    await page.getByTestId('ai-download').click();
    const txt = readFileSync((await (await dl).path())!, 'utf8');
    const promptPart = txt.split('PROMPT (EN):')[1].split('NEGATIVE PROMPT:')[0];
    hasLogo(promptPart);

    await page.getByTestId('ai-regenerate').click();
    hasLogo(await box.inputValue());

    await page.getByTestId('ai-title').fill(title);
    await page.getByTestId('ai-save').click();
    await expect(page.getByTestId('toast').last()).toContainText('حُفظ');
    // start the next one fresh
    await page.getByRole('button', { name: 'برومبت جديد' }).click();
  }

  // Even if the user deletes the block in the box, what leaves the studio has it
  await page.getByTestId('ai-idea').fill('ملصق بسيط');
  await page.getByTestId('ai-generate').click();
  const full = await box.inputValue();
  await box.fill(full.split(MARK)[0].trim() + ' Soft light.');
  expect(await box.inputValue()).not.toContain(MARK);
  await page.getByTestId('ai-copy').click();
  hasLogo(await clip(page));
  expect(await clip(page)).toContain('Soft light.');
  await page.getByTestId('ai-title').fill('معدّل بلا شعار');
  await page.getByTestId('ai-save').click();
  // saving is asynchronous (IndexedDB); the saved text is then put back in the box
  await expect(box).toHaveValue(/MANDATORY BRAND LOGO:/);
  hasLogo(await box.inputValue());

  // Library: every saved prompt, its copy and its duplicate carry the block
  await page.getByTestId('ai-tab-library').click();
  await expect(page.getByTestId('ai-lib-item')).toHaveCount(4);
  await page.getByTestId('ai-lib-duplicate').first().click();
  await expect(page.getByTestId('ai-lib-item')).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await page.getByTestId('ai-lib-item').nth(i).getByRole('button', { name: /^نسخ / }).click();
    hasLogo(await clip(page));
  }
  await page.getByTestId('ai-lib-open').nth(2).click();
  hasLogo(await box.inputValue());
});

test('a prompt saved before 1.3.0 (without the block) gets it when opened, copied or duplicated', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'one size');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await disableSplash(page);
  await page.goto('./#/ai-studio');
  await page.getByTestId('ai-idea').fill('olive');
  await page.getByTestId('ai-generate').click();
  // write an «old» record straight into the local database, as 1.2.0 stored it
  await page.evaluate(async () => {
    const open = indexedDB.open('ibrahi8m-edu');
    const db: IDBDatabase = await new Promise((ok, fail) => {
      open.onsuccess = () => ok(open.result);
      open.onerror = () => fail(open.error);
    });
    const tx = db.transaction('prompts', 'readwrite');
    tx.objectStore('prompts').put({
      id: 'old-1',
      title: 'برومبت قديم',
      type: 'social',
      mode: 'pro',
      brandId: null,
      input: { idea: 'olive', subjectEn: '', type: 'social', goal: '', audience: '', platform: '', ratio: '4:5', style: '', colors: '', lighting: '', background: '', angle: '', composition: '', textPlacement: '', logoPlacement: '', detail: 'high', texts: '', required: '', avoid: '' },
      output: { promptEn: 'A social media post design about olive, vertical 4:5 aspect ratio.', explanationAr: '', typeLabel: '', colors: '', ratio: '', texts: [], negative: '', logoRules: 'Do not draw or invent any logo.', warnings: [] },
      editedPrompt: '',
      createdAt: 1,
      updatedAt: 1,
    });
    await new Promise((ok) => (tx.oncomplete = ok));
    db.close();
  });
  await page.reload();
  await page.getByTestId('ai-tab-library').click();
  const item = page.getByTestId('ai-lib-item').filter({ hasText: 'برومبت قديم' }).filter({ hasNotText: '(نسخة)' });
  await item.getByRole('button', { name: /^نسخ / }).click();
  hasLogo(await clip(page));
  await item.getByTestId('ai-lib-duplicate').click();
  await page.getByTestId('ai-lib-item').filter({ hasText: 'برومبت قديم (نسخة)' }).getByRole('button', { name: /^نسخ / }).click();
  hasLogo(await clip(page));
  await item.getByTestId('ai-lib-open').click();
  hasLogo(await page.getByTestId('ai-prompt').inputValue());
  await expect(page.getByTestId('ai-logo-place')).toHaveValue('auto'); // «بلا شعار» became «موضع مناسب»
});

test('«تركيب الشعار»: the original logo file is placed on a generated image, pixel-exact, and saved as PNG', async ({ page }, info) => {
  test.skip(!heavy(info.project.name) && !isPhone(info.project.name), 'computer and phones');
  await disableSplash(page);
  await page.goto('./#/ai-studio?tab=compose');
  await expect(page.getByTestId('logo-composer')).toBeVisible();
  await page.getByTestId('compose-input').setInputFiles(FX('energy-diagram.png'));
  await expect(page.getByTestId('compose-canvas')).toBeVisible();
  await expect(page.getByTestId('compose-canvas')).toHaveAttribute('data-logo-box', /\d+,\d+,\d+,\d+/);
  // a wrong file type is refused with a message
  await page.getByTestId('compose-input').setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(page.getByTestId('toast').last()).toContainText('PNG أو JPG أو WebP');

  // the logo region equals the original SVG drawn at the same size (the artwork is not changed)
  const check = await page.evaluate(async () => {
    const c = document.querySelector('[data-testid=compose-canvas]') as HTMLCanvasElement;
    const [x, y, w, h] = c.dataset.logoBox!.split(',').map(Number);
    const logo = new Image();
    logo.src = `${location.pathname}brand/ibrahi8m-mark.svg`;
    await logo.decode();
    const ref = document.createElement('canvas');
    ref.width = w;
    ref.height = h;
    ref.getContext('2d')!.drawImage(logo, 0, 0, w, h);
    const a = c.getContext('2d')!.getImageData(x, y, w, h).data;
    const b = ref.getContext('2d')!.getImageData(0, 0, w, h).data;
    let same = 0;
    let opaque = 0;
    for (let i = 0; i < a.length; i += 4)
      if (b[i + 3] === 255) {
        opaque++;
        if (Math.abs(a[i] - b[i]) <= 2 && Math.abs(a[i + 1] - b[i + 1]) <= 2 && Math.abs(a[i + 2] - b[i + 2]) <= 2) same++;
      }
    return { w: c.width, h: c.height, ratio: same / opaque, logoW: w, logoH: h };
  });
  expect(check.ratio).toBeGreaterThan(0.99);
  expect(check.logoW).toBe(check.logoH); // the mark is square: proportions kept

  await page.getByTestId('compose-corner').selectOption('top-right');
  const dl = page.waitForEvent('download');
  await page.getByTestId('compose-save').click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe('energy-diagram-IBRAHI8M.png');
  const png = readFileSync((await file.path())!);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(check.w); // same size as the uploaded image
  expect(png.readUInt32BE(20)).toBe(check.h);
  const [sw, vw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(vw);
});

test('the real logo files are part of the app (SVG and PNG), available offline', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'one size');
  await disableSplash(page);
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await context.setOffline(true);
  await page.goto('./#/ai-studio');
  for (const id of ['ai-logo-download', 'ai-logo-download-png']) {
    const href = await page.getByTestId(id).getAttribute('href');
    expect(await page.evaluate(async (u) => (await fetch(u!)).status, href)).toBe(200);
  }
  await context.setOffline(false);
});
