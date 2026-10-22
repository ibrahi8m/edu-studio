import { expect, test, type Page } from '@playwright/test';
import { disableSplash } from './quiz-helpers';

/**
 * 1.4.0 — the prompt is self-contained (pasted into ChatGPT): the logo is described in full,
 * the chosen identity has its own section, and nothing points to a file. Plus the web side of the
 * Android app bridge (downloads handed to the native «Save as» screen).
 */

const clip = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const one = (t: string, s: string) => t.split(s).length - 1;

test('five design kinds, two identities: what is copied carries the full logo specification and the right identity, with no file reference', async ({ page, context }, info) => {
  test.skip(!['desktop-1440', 'phone-pixel-7'].includes(info.project.name), 'one computer and one phone size');
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await disableSplash(page);
  await page.goto('./#/ai-studio');
  await page.getByTestId('ai-advanced-toggle').click();

  for (const [idea, type, brand] of [
    ['منشور تعليمي عن الأمن الرقمي', 'social', 'IBRAHI8M EDU STUDIO'],
    ['إنفوجرافيك عن دورة الماء', 'infographic', 'IBRAHI8M EDU STUDIO'],
    ['إعلان عن دورة برمجة', 'commercial', 'IBRAHI8M EDU STUDIO'],
    ['تصميم إبداعي لروبوت يرسم', 'poster', 'IBRAHI8M EDU STUDIO'],
    ['لوحة فنية لمجرة', 'poster', 'IBRAHIM AI UNIVERSE'],
  ]) {
    await page.getByTestId('ai-idea').fill(idea);
    await page.getByTestId('ai-type').selectOption(type);
    await page.getByTestId('ai-brand').selectOption({ label: brand });
    await page.getByTestId('ai-generate').click();
    await page.getByTestId('ai-copy').click();
    const t = await clip(page);
    expect(one(t, 'MANDATORY BRAND LOGO:'), idea).toBe(1);
    expect(one(t, 'LOGO SPECIFICATION:'), idea).toBe(1);
    expect(one(t, `BRAND IDENTITY — ${brand}`), idea).toBe(1);
    for (const s of ['I-B-R-A-H-I-8-M', 'robot head', 'circuit ring', '#0E1014', '#2F7BFF', '#A9B1BC', 'Logo size:', 'No logo file is attached']) expect(t, `${idea}: ${s}`).toContain(s);
    expect(t, idea).not.toMatch(/\.svg|\.png|\/brand\/|provided with the project/);
    expect(t.indexOf('BRAND IDENTITY')).toBeLessThan(t.indexOf('MANDATORY BRAND LOGO:'));
    if (brand === 'IBRAHIM AI UNIVERSE') {
      expect(t).toContain('do not invent an emblem');
      expect(t).toContain('with no second line');
      expect(t).not.toContain('second line "EDU STUDIO"');
    } else expect(t).toContain('second line "EDU STUDIO"');
  }
  await expect(page.getByTestId('ai-explanation')).toContainText('مكتفٍ بذاته');
  await expect(page.getByTestId('ai-explanation')).toContainText('لا يضمن');
});

test('Android app bridge (web side): downloads go to the native save screen with their name and full content', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'phone-pixel-7', 'phone size');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // what the APK's Java bridge provides, recorded instead of saved
  await page.addInitScript(() => {
    const saved: { name: string; mime: string; b64: string }[] = [];
    (window as unknown as { __saved: typeof saved }).__saved = saved;
    (window as unknown as { ibrahi8mAndroid: object }).ibrahi8mAndroid = {
      save: (name: string, mime: string, b64: string) => saved.push({ name, mime, b64 }),
      version: () => '1.4.0',
    };
  });
  await disableSplash(page);
  await page.goto('./#/settings');
  await expect(page.getByTestId('offline-state')).toContainText('تطبيق Android');
  await page.goto('./#/ai-studio');
  await page.getByTestId('ai-idea').fill('إعلان تعليمي');
  await page.getByTestId('ai-generate').click();
  await page.getByTestId('ai-download').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __saved: unknown[] }).__saved.length)).toBe(1);
  const f = await page.evaluate(() => (window as unknown as { __saved: { name: string; mime: string; b64: string }[] }).__saved[0]);
  expect(f.name).toMatch(/\.txt$/);
  const text = Buffer.from(f.b64, 'base64').toString('utf8');
  expect(text).toContain('MANDATORY BRAND LOGO:');
  expect(text).toContain('LOGO SPECIFICATION:');
  // a link the user taps (the original logo file) goes through the bridge too
  await page.getByTestId('ai-logo-download-png').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __saved: unknown[] }).__saved.length)).toBe(2);
  const png = await page.evaluate(() => (window as unknown as { __saved: { name: string; b64: string }[] }).__saved[1]);
  expect(png.name).toBe('ibrahi8m-mark-1024.png');
  expect(Buffer.from(png.b64, 'base64').subarray(1, 4).toString()).toBe('PNG');
});

test('in a normal browser nothing changes: no bridge, downloads work as before', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'one size');
  await disableSplash(page);
  await page.goto('./#/ai-studio');
  expect(await page.evaluate(() => document.documentElement.dataset.platform ?? '')).toBe('');
  await page.getByTestId('ai-idea').fill('x');
  await page.getByTestId('ai-generate').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('ai-download').click();
  expect((await dl).suggestedFilename()).toMatch(/\.txt$/);
});
