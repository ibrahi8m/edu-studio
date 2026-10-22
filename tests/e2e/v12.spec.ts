import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { chooseStudent, disableSplash, isPhone } from './quiz-helpers';

/** 1.2.0: animated background, dark/light/auto, generated music and interface sounds. */

const heavy = (name: string) => ['desktop-1440', 'phone-pixel-7'].includes(name);
const bg = (page: Page) => page.getByTestId('ambient-bg');
const audio = (page: Page) => page.evaluate(() => {
  const a = (window as unknown as { ibrahi8mAudio: { getState: () => { transport: string; track: string | null }; log: { sfx: string[]; starts: number } } }).ibrahi8mAudio;
  return { ...a.getState(), sfx: [...a.log.sfx], starts: a.log.starts, contexts: (window as unknown as { __ctxCount: number }).__ctxCount ?? 0 };
});
const visible = (page: Page, id: string) => page.locator(`[data-testid="${id}"]:visible`).first();

async function settings(page: Page) {
  await page.goto('./#/settings');
  await expect(page.getByTestId('settings-appearance')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // count AudioContexts the app creates (proves nothing is created before the user asks)
  await page.addInitScript(() => {
    const W = window as unknown as { AudioContext: typeof AudioContext; __ctxCount: number };
    const Orig = W.AudioContext;
    W.__ctxCount = 0;
    if (Orig)
      W.AudioContext = class extends Orig {
        constructor(...a: ConstructorParameters<typeof AudioContext>) {
          super(...a);
          W.__ctxCount++;
        }
      } as typeof AudioContext;
  });
});

test('background: on by default (calm), each type, full / still / off, page-dependent strength, never above the controls', async ({ page }) => {
  await disableSplash(page);
  await page.goto('./');
  await expect(bg(page)).toHaveAttribute('data-level', 'calm');
  await expect(bg(page)).toHaveAttribute('data-zone', 'feature');
  await expect(bg(page)).toHaveAttribute('data-state', 'moving');
  // under everything, takes no clicks
  const style = await bg(page).evaluate((c) => ({ pe: getComputedStyle(c).pointerEvents, z: getComputedStyle(c).zIndex, pos: getComputedStyle(c).position }));
  expect(style).toEqual({ pe: 'none', z: '0', pos: 'fixed' });
  const btn = page.getByTestId('dashboard-new-content');
  await btn.scrollIntoViewIfNeeded();
  const box = (await btn.boundingBox())!;
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a,button')?.getAttribute('data-testid'), [box.x + box.width / 2, box.y + box.height / 2]);
  expect(hit).toBe('dashboard-new-content');
  // the canvas is sized to the screen (pixel ratio capped)
  const size = await bg(page).evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height, cw: c.clientWidth, dpr: window.devicePixelRatio }));
  expect(size.cw).toBe(page.viewportSize()!.width);
  expect(size.w / size.cw).toBeLessThanOrEqual(1.5);

  await settings(page);
  for (const [label, kind] of [
    ['تدرجات ضوئية', 'gradient'],
    ['شبكة تقنية', 'grid'],
    ['موجات ضوئية', 'waves'],
    ['جسيمات', 'particles'],
  ]) {
    await page.getByRole('radio', { name: label }).click();
    await expect(bg(page)).toHaveAttribute('data-kind', kind);
  }
  await page.getByRole('radio', { name: 'حركة كاملة' }).click();
  await expect(bg(page)).toHaveAttribute('data-level', 'full');
  await page.getByRole('radio', { name: 'خلفية ثابتة' }).click();
  await expect(bg(page)).toHaveAttribute('data-state', 'still');
  await page.getByRole('radio', { name: 'إيقاف كل الحركة' }).click();
  await expect(bg(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe('reduce');
  await page.getByRole('radio', { name: 'حركة هادئة' }).click();
  await expect(bg(page)).toHaveAttribute('data-state', 'moving');

  // strength by page
  for (const [route, zone] of [
    ['ai-studio', 'tech'],
    ['projects', 'quiet'],
    ['learn', 'quiet'],
    ['me', 'quiet'],
  ]) {
    await page.goto(`./#/${route}`);
    await expect(bg(page), route).toHaveAttribute('data-zone', zone);
  }
});

test('the system «reduce motion» setting turns the background into a still frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await disableSplash(page);
  await settings(page);
  await page.getByRole('radio', { name: 'حركة كاملة' }).click();
  await expect(bg(page)).toHaveAttribute('data-state', 'still');
  await expect(page.getByTestId('motion-system-note')).toBeVisible();
});

test('performance: the moving background keeps the page smooth (frames measured)', async ({ page }, info) => {
  await disableSplash(page);
  await settings(page);
  await page.getByRole('radio', { name: 'حركة كاملة' }).click();
  await page.goto('./');
  await page.waitForTimeout(500);
  const m = await page.evaluate(
    () =>
      new Promise<{ fps: number; long: number; worst: number }>((ok) => {
        let frames = 0;
        let long = 0;
        let worst = 0;
        let prev = performance.now();
        const t0 = prev;
        const step = (t: number) => {
          frames++;
          worst = Math.max(worst, t - prev);
          if (t - prev > 50) long++;
          prev = t;
          if (t - t0 < 3000) requestAnimationFrame(step);
          else ok({ fps: Math.round((frames * 1000) / (t - t0)), long, worst: Math.round(worst) });
        };
        requestAnimationFrame(step);
      }),
  );
  test.info().annotations.push({ type: 'perf', description: `${info.project.name}: ${m.fps} fps, ${m.long} frames over 50 ms, worst ${m.worst} ms` });
  console.log(`PERF ${info.project.name}: ${m.fps} fps, ${m.long} frames > 50 ms, worst ${m.worst} ms`);
  expect(m.fps).toBeGreaterThanOrEqual(30);
  expect(m.long).toBeLessThanOrEqual(5);
  // scrolling a long page with the background running
  await page.mouse.wheel(0, 2000);
  await page.mouse.wheel(0, -2000);
});

test('dark, light and automatic theme: button on every screen, saved, follows the device live; no contrast violations', async ({ page }, info) => {
  await disableSplash(page);
  await page.goto('./');
  const btn = visible(page, 'theme-button');
  await expect(btn).toHaveAttribute('data-mode', 'dark');
  await btn.click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await expect(btn).toHaveAttribute('data-mode', 'light');
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  // automatic: follows the device, live
  await visible(page, 'theme-button').click();
  await expect(visible(page, 'theme-button')).toHaveAttribute('data-mode', 'system');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  // the learner environment has the button too
  await page.goto('./#/learn');
  await expect(visible(page, 'theme-button')).toBeVisible();

  if (!heavy(info.project.name)) return;
  // both themes, every main screen and an open dialog: no serious/critical axe violations (incl. contrast)
  for (const theme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const r of ['', 'projects', 'learn', 'results', 'me', 'about', 'ai-studio', 'settings', 'quizzes', 'library']) {
      await page.goto(`./#/${r}`);
      await expect(page.locator('.page, .take-wrap').first()).toBeVisible();
      await page.waitForTimeout(250);
      const v = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.ambient-bg').analyze()).violations.filter((x) => x.impact === 'serious' || x.impact === 'critical');
      expect(v.map((x) => `${theme} ${r}: ${x.id} ${x.nodes[0]?.target.join(' ')}`)).toEqual([]);
    }
    await page.goto('./#/projects');
    await page.getByTestId('new-project').click();
    const v = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.filter((x) => x.impact === 'serious' || x.impact === 'critical');
    expect(v.map((x) => `${theme} dialog: ${x.id}`)).toEqual([]);
  }
});

test('sound: nothing plays on opening; play, pause, resume, volume, track change keep playing across pages; stop; settings saved but playback never resumes by itself', async ({ page }, info) => {
  test.skip(!heavy(info.project.name), 'one computer and one phone size');
  await disableSplash(page);
  await page.goto('./');
  await page.waitForTimeout(400);
  expect(await audio(page)).toMatchObject({ transport: 'stopped', starts: 0, contexts: 0 });

  await visible(page, 'sound-button').click();
  const pop = page.getByTestId('sound-popover');
  await expect(pop).toBeVisible();
  await pop.getByTestId('music-play').click();
  await expect(pop.getByTestId('music-state')).toHaveText('تعمل الآن');
  await expect.poll(async () => (await audio(page)).starts).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __ctxCount: number }).__ctxCount)).toBe(1);
  await pop.getByTestId('music-pause').click();
  await expect(pop.getByTestId('music-state')).toHaveText('متوقفة مؤقتًا');
  await pop.getByTestId('music-resume').click();
  await expect(pop.getByTestId('music-state')).toHaveText('تعمل الآن');
  await pop.getByTestId('music-volume').fill('70');
  await pop.getByTestId('music-track').selectOption('space');
  await expect.poll(async () => (await audio(page)).track).toBe('space');

  // moving between pages does not restart the music
  const before = (await audio(page)).starts;
  await page.keyboard.press('Escape');
  for (const r of ['projects', 'ai-studio', 'me', '']) {
    await page.goto(`./#/${r}`);
    expect((await audio(page)).transport).toBe('playing');
  }
  expect((await audio(page)).starts).toBe(before);

  await visible(page, 'sound-button').click();
  await page.getByTestId('sound-popover').getByTestId('music-stop').click();
  await expect.poll(async () => (await audio(page)).transport).toBe('stopped');

  // the choices are kept; playback is not
  await page.reload();
  await page.waitForTimeout(500);
  expect(await audio(page)).toMatchObject({ transport: 'stopped', starts: 0, contexts: 0 });
  await settings(page);
  await expect(page.getByTestId('music-track')).toHaveValue('space');
  await expect(page.getByTestId('music-volume')).toHaveValue('70');
});

test('interface sounds: off by default; when on they mark prompt, copy, save, export and errors; mute silences everything', async ({ page, context }, info) => {
  test.skip(!heavy(info.project.name), 'one computer and one phone size');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await disableSplash(page);
  await page.goto('./#/ai-studio');
  await page.getByTestId('ai-idea').fill('olive tree');
  await page.getByTestId('ai-generate').click();
  await page.getByTestId('ai-copy').click();
  expect((await audio(page)).sfx).toEqual([]); // off by default
  expect((await audio(page)).contexts).toBe(0);

  await settings(page);
  await page.getByTestId('sfx-toggle').check();
  await expect(page.getByTestId('sfx-volume')).toBeVisible();
  await page.goto('./#/ai-studio');
  await page.getByTestId('ai-idea').fill('olive tree');
  await page.getByTestId('ai-generate').click();
  await page.getByTestId('ai-copy').click();
  await page.getByTestId('ai-title').fill('زيتون');
  await page.getByTestId('ai-save').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('ai-download').click();
  await dl;
  await expect.poll(async () => (await audio(page)).sfx).toEqual(['prompt', 'copy', 'save', 'export']);
  // an error sounds
  await page.getByTestId('ai-idea').fill('');
  await page.goto('./#/projects');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-save').click(); // empty title: field error, no toast
  await page.getByTestId('project-dialog').getByRole('button', { name: 'إلغاء' }).click();

  // mute: nothing more
  await settings(page);
  await page.getByTestId('mute-all').check();
  await page.goto('./#/ai-studio');
  await page.getByTestId('ai-idea').fill('olive');
  await page.getByTestId('ai-generate').click();
  expect((await audio(page)).sfx).toEqual(['prompt', 'copy', 'save', 'export']);
  // settings survive a reload
  await page.reload();
  await settings(page);
  await expect(page.getByTestId('sfx-toggle')).toBeChecked();
  await expect(page.getByTestId('mute-all')).toBeChecked();
});

// 1.3.0 made the logo mandatory (IBRAHI8M, always): the identity-dependent logo checks of 1.2.0 were replaced in v13.spec.
test('AI Design Studio: five essentials up front, the rest in «إعدادات متقدمة»; the original logo is in every new prompt', async ({ page }, info) => {
  test.skip(!heavy(info.project.name) && !isPhone(info.project.name), 'computer and phones');
  await disableSplash(page);
  await page.goto('./#/ai-studio');
  for (const id of ['ai-idea', 'ai-type', 'ai-ratio-1:1', 'ai-texts', 'ai-generate']) await expect(page.getByTestId(id)).toBeVisible();
  for (const id of ['ai-style', 'ai-lighting', 'ai-colors', 'ai-brand', 'ai-logo-place', 'ai-mode-pro']) await expect(page.getByTestId(id)).toBeHidden();
  await expect(page.getByTestId('ai-logo-note')).toContainText('IBRAHI8M');
  // the real logo file is offered, and served by the app
  const href = await page.getByTestId('ai-logo-download').getAttribute('href');
  expect(href).toContain('brand/ibrahi8m-mark.svg');
  expect(await page.evaluate(async (u) => (await fetch(u!)).status, href)).toBe(200);

  await page.getByTestId('ai-idea').fill('ملصق عن الأمن الرقمي');
  await page.getByTestId('ai-generate').click();
  await expect(page.getByTestId('ai-logo-rules')).toContainText("owner's original official IBRAHI8M brand logo");
  await expect(page.getByTestId('ai-logo-rules')).toContainText('LOGO SPECIFICATION:'); // 1.4.0: described, not a file name
  await expect(page.getByTestId('ai-logo-rules')).not.toContainText('.svg');
  await expect(page.getByTestId('ai-explanation')).toContainText('لا يضمن أن ترسم أداة التوليد شعارًا معقّدًا مطابقًا');
  await expect(page.getByTestId('ai-output')).toHaveClass(/is-fresh/);

  await page.getByTestId('ai-advanced-toggle').click();
  await expect(page.getByTestId('ai-style')).toBeVisible();
  await page.getByTestId('ai-brand').selectOption('brand-ai-universe');
  await page.getByTestId('ai-generate').click();
  await expect(page.getByTestId('ai-logo-rules')).toContainText("owner's original official IBRAHI8M brand logo");
  // no way to switch the logo off
  expect(await page.getByTestId('ai-brand').locator('option').allTextContents()).not.toContain('بلا هوية ولا شعار');
  expect(await page.getByTestId('ai-logo-place').locator('option').allTextContents()).not.toContain('بلا شعار');
  const [sw, vw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(vw);
});

test('phones and tablets: theme and sound controls are reachable by touch and the sound sheet fits', async ({ page }, info) => {
  test.skip(!isPhone(info.project.name) && info.project.name !== 'tablet-ipad-mini', 'phones and tablet');
  await disableSplash(page);
  await page.goto('./');
  for (const id of ['theme-button', 'sound-button']) {
    const b = (await visible(page, id).boundingBox())!;
    expect(b.height, id).toBeGreaterThanOrEqual(40);
  }
  await visible(page, 'sound-button').tap();
  const pop = page.getByTestId('sound-popover');
  await expect(pop).toBeVisible();
  const p = (await pop.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x + p.width).toBeLessThanOrEqual(vp.width);
  expect(p.y + p.height).toBeLessThanOrEqual(vp.height);
  await expect(pop.getByTestId('music-play')).toBeInViewport();
  await page.keyboard.press('Escape');
  // the learner bar (brand, connection, theme, sound, name, exit) and the offline icon still fit
  await chooseStudent(page, 'عبد الرحمن');
  await page.context().setOffline(true);
  for (const r of ['learn', '']) {
    await page.goto(`./#/${r}`);
    await page.waitForTimeout(300);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw, r).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(cw, r).toBe(page.viewportSize()!.width);
  }
  await page.context().setOffline(false);
});

test('offline: background and generated sound work with the network cut', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'one size');
  await disableSplash(page);
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await context.setOffline(true);
  await page.goto('./#/ai-studio');
  await expect(bg(page)).toHaveAttribute('data-zone', 'tech');
  await visible(page, 'sound-button').click();
  await page.getByTestId('sound-popover').getByTestId('music-play').click();
  await expect(page.getByTestId('sound-popover').getByTestId('music-state')).toHaveText('تعمل الآن');
  await context.setOffline(false);
});
