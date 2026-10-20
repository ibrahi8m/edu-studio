import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { launchProfile, newProfileDir, primeOffline, watchNetwork } from './helpers';
import { chooseStudent, disableSplash, isPhone, lessonWithObjectives, waitSaved } from './quiz-helpers';

/* ───────── helpers ───────── */

async function newDesign(page: Page, kind: 'cards' | 'summary' | 'conceptmap', title: string, opts: { lesson?: string | null; fromLesson?: boolean } = {}) {
  await page.goto('./#/studio');
  await page.getByTestId('new-design').click();
  const d = page.getByTestId('create-design-dialog');
  await d.getByTestId(`kind-${kind}`).check();
  await d.getByTestId('design-title-input').fill(title);
  await d.getByTestId('design-project-select').selectOption({ label: 'وحدة الطاقة' });
  if (opts.lesson) await d.getByTestId('design-lesson-select').selectOption({ label: opts.lesson });
  const from = d.getByTestId('design-from-lesson');
  if (opts.lesson) {
    // the option appears once the lesson content has been read
    await expect(from).toBeVisible();
    if (opts.fromLesson) await from.check();
    else if (await from.isEnabled()) await from.uncheck();
    await expect(from).toBeChecked({ checked: !!opts.fromLesson });
  }
  await d.getByTestId('create-design-save').click();
  await expect(page.getByTestId('page-design-editor')).toBeVisible();
  await expect(page.getByTestId('design-title-field')).toHaveValue(title);
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

/** Everything that defines the map as shown: concepts (text, position, colour) and arrows (ends, words). */
async function mapState(page: Page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[data-testid="map-node"]')].map((g) => ({
      id: g.getAttribute('data-id'),
      x: Number(g.getAttribute('data-x')),
      y: Number(g.getAttribute('data-y')),
      text: g.getAttribute('aria-label'),
      fill: g.querySelectorAll('rect, ellipse')[g.querySelectorAll('rect, ellipse').length - 1]?.getAttribute('fill'),
      shape: g.querySelectorAll('ellipse').length ? 'ellipse' : 'box',
    }));
    const edges = [...document.querySelectorAll('[data-testid="map-edge"]')].map((g) => `${g.getAttribute('data-from')}>${g.getAttribute('data-to')}:${g.textContent}`);
    const list = [...document.querySelectorAll('[data-testid="edge-list-item"]')].map((b) => b.textContent);
    return { nodes, edges: edges.sort(), list };
  });
}

/** Drags a concept by (dx, dy) screen pixels: mouse on computers, a real finger (touch events) on phones and tablets. */
async function dragNode(page: Page, index: number, dx: number, dy: number, touch: boolean) {
  const node = page.getByTestId('map-node').nth(index);
  await node.scrollIntoViewIfNeeded();
  const b = (await node.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  if (!touch) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Checks a PNG file: signature, size from its header, and that it is a real picture (many colours, not blank). */
async function checkPng(page: Page, file: string, minWidth: number) {
  const buf = readFileSync(file);
  expect([...buf.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  expect(width).toBeGreaterThanOrEqual(minWidth);
  expect(height).toBeGreaterThan(200);
  const colours = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 37) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return seen.size;
  }, buf.toString('base64'));
  expect(colours, 'the PNG has text and shapes, not one flat colour').toBeGreaterThan(40);
  return { width, height };
}

const NAMES = ['متجددة', 'غير متجددة', 'الشمس', 'الرياح', 'المياه', 'الفحم', 'النفط', 'الغاز', 'الكهرباء'];
const LINKS: [string, string, string][] = [
  ['الطاقة', 'متجددة', 'نوعها'],
  ['الطاقة', 'غير متجددة', 'نوعها'],
  ['متجددة', 'الشمس', 'مثل'],
  ['متجددة', 'الرياح', 'مثل'],
  ['متجددة', 'المياه', 'مثل'],
  ['غير متجددة', 'الفحم', 'مثل'],
  ['غير متجددة', 'النفط', 'مثل'],
  ['غير متجددة', 'الغاز', 'مثل'],
  ['الشمس', 'الكهرباء', ''],
];

/** Builds the 10-concept map of the acceptance test through the interface. */
async function buildTenConceptMap(page: Page, touch: boolean) {
  const press = async (l: ReturnType<Page['getByTestId']>) => (touch ? l.tap() : l.click());
  // the map starts with one main concept
  await expect(page.getByTestId('map-node')).toHaveCount(1);
  await press(page.getByTestId('map-node').first());
  await page.getByTestId('node-text').fill('الطاقة');
  for (const n of NAMES) {
    await press(page.getByTestId('map-add-node'));
    await expect(page.getByTestId('node-text')).toBeFocused();
    await page.getByTestId('node-text').fill(n);
  }
  await expect(page.getByTestId('map-node')).toHaveCount(10);
  await expect(page.getByTestId('map-count')).toHaveText('10 مفاهيم · 0 أسهم');
  const node = (t: string) => page.locator(`[data-testid="map-node"][aria-label="مفهوم: ${t}"]`);
  // 8 arrows from the side panel (choose the concept, then «to»), the last one by tapping two concepts on the canvas
  for (const [from, to, label] of LINKS.slice(0, 8)) {
    await press(page.getByTestId('node-list-item').filter({ hasText: new RegExp(`^${from}$`) }));
    await page.getByTestId('edge-to').selectOption({ label: to });
    await page.getByTestId('edge-new-label').fill(label);
    await press(page.getByTestId('edge-add'));
    await expect(page.getByTestId('edge-props')).toBeVisible();
  }
  await press(page.getByTestId('map-link-mode'));
  await expect(page.getByTestId('map-hint')).toHaveText('اختر المفهوم الذي يبدأ منه السهم.');
  await node('الشمس').scrollIntoViewIfNeeded();
  await press(node('الشمس'));
  await expect(page.getByTestId('map-hint')).toContainText('من «الشمس»');
  await node('الكهرباء').scrollIntoViewIfNeeded();
  await press(node('الكهرباء'));
  await expect(page.getByTestId('edge-props')).toContainText('من «الشمس» إلى «الكهرباء»');
  await page.getByTestId('edge-label').fill('تولّد');
  await expect(page.getByTestId('map-count')).toHaveText('10 مفاهيم · 9 أسهم');
  // a duplicate arrow is refused
  await press(page.getByTestId('node-list-item').filter({ hasText: /^الطاقة$/ }));
  await page.getByTestId('edge-to').selectOption({ label: 'متجددة' });
  await press(page.getByTestId('edge-add'));
  await expect(page.getByText('هذا السهم موجود من قبل.')).toBeVisible();
  await expect(page.getByTestId('map-count')).toHaveText('10 مفاهيم · 9 أسهم');
  // colour and shape of one concept
  await press(page.getByTestId('node-list-item').filter({ hasText: /^الكهرباء$/ }));
  await press(page.getByTestId('node-color').nth(4));
  await page.getByTestId('node-shape').selectOption('ellipse');
}

test.describe('Phase 5 — design studio', () => {
  test.beforeEach(async ({ page }) => {
    await disableSplash(page);
  });

  test('ACCEPTANCE: a concept map of 10 concepts is built, dragged (mouse or finger, RTL page), saved and reopened exactly as it was; keyboard works; PNG export', async ({ page }, info) => {
    test.setTimeout(300_000);
    const touch = isPhone(info.project.name) || info.project.name.startsWith('tablet');
    const shots = `docs/screenshots/${info.project.name}`;
    await lessonWithObjectives(page);
    await newDesign(page, 'conceptmap', 'خريطة الطاقة', { lesson: 'مصادر الطاقة', fromLesson: false });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await buildTenConceptMap(page, touch);

    // drag two concepts; positions are in canvas units and must move in the dragged direction (no RTL mirroring)
    const before = await mapState(page);
    const idx = (t: string) => before.nodes.findIndex((n) => n.text === `مفهوم: ${t}`);
    await dragNode(page, idx('الفحم'), 60, 40, touch);
    await dragNode(page, idx('الرياح'), -50, -30, touch);
    const moved = await mapState(page);
    const fahm = moved.nodes[idx('الفحم')];
    const riyah = moved.nodes[idx('الرياح')];
    expect(fahm.x - before.nodes[idx('الفحم')].x, 'dragged right → x grows').toBeGreaterThan(5);
    expect(fahm.y - before.nodes[idx('الفحم')].y, 'dragged down → y grows').toBeGreaterThan(5);
    expect(riyah.x - before.nodes[idx('الرياح')].x, 'dragged left → x shrinks').toBeLessThan(-5);
    // other concepts did not move
    expect(moved.nodes.filter((_, i) => i !== idx('الفحم') && i !== idx('الرياح'))).toEqual(before.nodes.filter((_, i) => i !== idx('الفحم') && i !== idx('الرياح')));

    // keyboard: focus a concept, arrows move it by 10 (40 with Shift)
    if (!touch) {
      const gas = page.locator('[data-testid="map-node"][aria-label="مفهوم: الغاز"]');
      await gas.focus();
      const x0 = Number(await gas.getAttribute('data-x'));
      const y0 = Number(await gas.getAttribute('data-y'));
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Shift+ArrowUp');
      await expect(gas).toHaveAttribute('data-x', String(x0 - 10));
      await expect(gas).toHaveAttribute('data-y', String(y0 - 40));
      await expect(page.getByTestId('node-text')).toHaveValue('الغاز');
      // Delete removes it with its arrow; undo restores both
      await page.keyboard.press('Delete');
      await expect(page.getByTestId('map-count')).toHaveText('9 مفاهيم · 8 أسهم');
      await page.getByRole('button', { name: 'تراجع' }).click();
      await expect(page.getByTestId('map-count')).toHaveText('10 مفاهيم · 9 أسهم');
    }
    await waitSaved(page);
    await expect(page.getByTestId('design-issues')).toHaveCount(0); // complete: every concept named and linked
    const saved = await mapState(page);
    expect(saved.nodes).toHaveLength(10);
    expect(saved.edges).toHaveLength(9);
    await fits(page, 'map editor');
    expect(await serious(page), 'map editor').toEqual([]);
    await page.screenshot({ path: `${shots}/p5-map-editor.png`, fullPage: true });

    // reopen: identical
    await page.reload();
    await expect(page.getByTestId('map-node')).toHaveCount(10);
    expect(await mapState(page)).toEqual(saved);
    await expect(page.locator('[data-testid="map-node"][aria-label="مفهوم: الكهرباء"] ellipse')).toHaveCount(1);
    await expect(page.getByTestId('edge-list-item').filter({ hasText: 'الشمس ← تولّد ← الكهرباء' })).toHaveCount(1);
    // and from the studio list
    await page.goto('./#/studio');
    await expect(page.getByTestId('design-tile')).toHaveCount(1);
    await page.getByRole('link', { name: 'فتح التصميم: خريطة الطاقة' }).click();
    await expect(page.getByTestId('map-node')).toHaveCount(10);
    expect(await mapState(page)).toEqual(saved);

    // final picture and PNG export
    await page.getByRole('radio', { name: 'الصورة النهائية' }).click();
    await expect(page.getByTestId('design-preview').getByTestId('design-node')).toHaveCount(10);
    await expect(page.getByTestId('design-preview').getByTestId('design-heading')).toHaveText('خريطة الطاقة');
    const dl = page.waitForEvent('download');
    await page.getByTestId('export-png').click();
    const file = await dl;
    expect(file.suggestedFilename()).toBe('خريطة الطاقة.png');
    const p = `test-results/${info.project.name}-map.png`;
    await file.saveAs(p);
    await checkPng(page, p, 1800);
    await expect(page.getByText(/صُدّرت الصورة «خريطة الطاقة.png»/)).toBeVisible();
    await page.screenshot({ path: `${shots}/p5-map-picture.png`, fullPage: true });
  });

  test('cards and visual summary: built, every layout drawn, PNG exported, added to a lesson that the student then sees', async ({ page }, info) => {
    test.setTimeout(300_000);
    const shots = `docs/screenshots/${info.project.name}`;
    await lessonWithObjectives(page);

    // ── cards ──
    await newDesign(page, 'cards', 'بطاقات الطاقة', { lesson: 'مصادر الطاقة' });
    await expect(page.getByTestId('design-issues')).toContainText('اكتب بطاقة واحدة على الأقل.');
    const cards: [string, string][] = [
      ['الطاقة المتجددة', 'طاقة لا تنفد، مثل الشمس والرياح.'],
      ['الوقود الأحفوري', 'فحم ونفط وغاز تكوّنت عبر ملايين السنين.'],
      ['التوربين', 'آلة تحوّل حركة الرياح إلى كهرباء.'],
    ];
    for (let i = 0; i < cards.length; i++) {
      if (i >= 2) await page.getByTestId('add-card').click();
      await page.getByTestId('card-front-input').nth(i).fill(cards[i][0]);
      await page.getByTestId('card-back-input').nth(i).fill(cards[i][1]);
    }
    const prev = page.getByTestId('design-preview');
    await expect(prev.getByTestId('design-card')).toHaveCount(3);
    await expect(prev.getByTestId('design-heading')).toHaveText('بطاقات الطاقة');
    await expect(prev).toContainText('الوقود الأحفوري');
    await expect(prev).toContainText('آلة تحوّل حركة الرياح إلى كهرباء.');
    // front only hides the backs; reorder moves card 3 first
    await page.getByRole('radio', { name: 'الوجه فقط' }).click();
    await expect(prev).not.toContainText('آلة تحوّل');
    await page.getByRole('radio', { name: 'الوجه والظهر' }).click();
    await page.getByRole('button', { name: 'نقل البطاقة 3 للأعلى' }).click();
    await page.getByRole('button', { name: 'نقل البطاقة 2 للأعلى' }).click();
    await expect(page.getByTestId('card-front-input').first()).toHaveValue('التوربين');
    await page.getByTestId('theme-paper').click();
    await waitSaved(page);
    await page.reload();
    await expect(page.getByTestId('card-front-input')).toHaveCount(3);
    await expect(page.getByTestId('card-front-input').first()).toHaveValue('التوربين');
    await expect(page.getByTestId('theme-paper')).toHaveAttribute('aria-checked', 'true');
    await fits(page, 'cards editor');
    expect(await serious(page), 'cards editor').toEqual([]);
    await page.screenshot({ path: `${shots}/p5-cards.png`, fullPage: true });
    const dl = page.waitForEvent('download');
    await page.getByTestId('export-png').click();
    const p = `test-results/${info.project.name}-cards.png`;
    await (await dl).saveAs(p);
    await checkPng(page, p, 1800);

    // ── visual summary in four layouts ──
    await newDesign(page, 'summary', 'ملخص الطاقة', { lesson: 'مصادر الطاقة' });
    await page.getByTestId('summary-heading').fill('مصادر الطاقة');
    const pts: [string, string][] = [
      ['متجددة', 'الشمس والرياح والمياه'],
      ['غير متجددة', 'الفحم والنفط والغاز'],
      ['الأثر البيئي', 'المتجددة أنظف للهواء'],
      ['الاستخدام', 'الكهرباء والنقل والتدفئة'],
    ];
    for (let i = 0; i < pts.length; i++) {
      if (i >= 3) await page.getByTestId('add-point').click();
      await page.getByTestId('point-title-input').nth(i).fill(pts[i][0]);
      await page.getByTestId('point-text-input').nth(i).fill(pts[i][1]);
    }
    for (const style of ['شبكة', 'خطوات متسلسلة', 'فكرة مركزية', 'خط زمني']) {
      await page.getByRole('radio', { name: style }).click();
      await expect(prev.getByTestId('design-point')).toHaveCount(4);
      await expect(prev).toContainText('الأثر البيئي');
      if (style === 'فكرة مركزية') await expect(prev.getByTestId('design-core')).toContainText('مصادر الطاقة');
      else await expect(prev.getByTestId('design-heading')).toHaveText('مصادر الطاقة');
    }
    await waitSaved(page);
    await expect(page.getByTestId('design-issues')).toHaveCount(0);
    await fits(page, 'summary editor');
    expect(await serious(page), 'summary editor').toEqual([]);
    await page.screenshot({ path: `${shots}/p5-summary.png`, fullPage: true });

    // ── add the summary to the lesson as a picture ──
    await page.getByTestId('add-to-lesson').click();
    const dlg = page.getByTestId('add-to-lesson-dialog');
    await expect(dlg.getByTestId('add-to-lesson-select')).toHaveValue(/.+/); // the design's lesson is preselected
    await expect(dlg.getByTestId('add-to-lesson-alt')).toHaveValue('ملخص بصري: ملخص الطاقة');
    await dlg.getByTestId('add-to-lesson-alt').fill('ملخص بصري لمصادر الطاقة المتجددة وغير المتجددة');
    await dlg.getByTestId('add-to-lesson-save').click();
    await expect(page.getByText('أُضيفت صورة التصميم إلى نهاية درس «مصادر الطاقة».')).toBeVisible();
    await page.getByRole('button', { name: 'فتح الدرس' }).click();
    await expect(page.getByTestId('page-editor')).toBeVisible();
    const img = page.getByTestId('block').last();
    await expect(img).toHaveAttribute('data-type', 'image');
    await expect(img.getByTestId('image-alt')).toHaveValue('ملخص بصري لمصادر الطاقة المتجددة وغير المتجددة');
    await expect.poll(() => img.getByTestId('image-preview').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(1000);

    // the project page lists both designs; the student sees the picture in the lesson
    await page.goto('./#/projects');
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-designs').locator('.quiz-row')).toHaveCount(2);
    await chooseStudent(page, 'سلمى');
    await page.locator('[data-testid="learn-lesson"][data-lesson="مصادر الطاقة"]').getByTestId('open-lesson').click();
    await page.getByTestId('lp-next').click();
    const seen = page.getByTestId('lv-image');
    await expect(seen).toHaveAttribute('alt', 'ملخص بصري لمصادر الطاقة المتجددة وغير المتجددة');
    await expect.poll(() => seen.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(1000);
    await page.screenshot({ path: `${shots}/p5-student-sees-design.png`, fullPage: true });
  });

  test('studio offline: designs and an exported PNG work with no network, and survive closing the browser', async ({}, testInfo) => {
    test.setTimeout(300_000);
    const dir = newProfileDir();
    const base = String(testInfo.project.use.baseURL);
    const ctx1 = await launchProfile(dir, testInfo);
    const p1 = ctx1.pages()[0] ?? (await ctx1.newPage());
    await primeOffline(p1);
    await disableSplash(p1);
    await ctx1.setOffline(true);
    const net1 = watchNetwork(p1, base);
    await lessonWithObjectives(p1);
    // start from the lesson: its two objectives become concepts around the lesson title
    await newDesign(p1, 'conceptmap', 'خريطة من الدرس', { lesson: 'مصادر الطاقة', fromLesson: true });
    await expect(p1.getByTestId('map-node')).toHaveCount(3);
    await expect(p1.getByTestId('map-count')).toHaveText('3 مفاهيم · 2 أسهم');
    await expect(p1.locator('[data-testid="map-node"][aria-label="مفهوم: مصادر الطاقة"]')).toHaveCount(1);
    await p1.getByTestId('theme-ocean').click();
    await waitSaved(p1);
    const state = await mapState(p1);
    const dl = p1.waitForEvent('download');
    await p1.getByTestId('export-png').click();
    const f = `test-results/${testInfo.project.name}-offline.png`;
    await (await dl).saveAs(f);
    await checkPng(p1, f, 1800);
    expect(net1.external).toEqual([]);
    await ctx1.close();

    const ctx2 = await launchProfile(dir, testInfo);
    await ctx2.setOffline(true);
    const page = ctx2.pages()[0] ?? (await ctx2.newPage());
    const net = watchNetwork(page, base);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('./#/studio');
    await page.getByRole('link', { name: 'فتح التصميم: خريطة من الدرس' }).click();
    await expect(page.getByTestId('map-node')).toHaveCount(3);
    expect(await mapState(page)).toEqual(state);
    await expect(page.getByTestId('theme-ocean')).toHaveAttribute('aria-checked', 'true');
    const dl2 = page.waitForEvent('download');
    await page.getByTestId('export-png').click();
    const f2 = `test-results/${testInfo.project.name}-offline2.png`;
    await (await dl2).saveAs(f2);
    await checkPng(page, f2, 1800);
    // studio list fits and is accessible
    await page.goto('./#/studio');
    await expect(page.getByTestId('design-tile')).toHaveCount(1);
    await fits(page, 'studio list');
    expect(await serious(page), 'studio list').toEqual([]);
    await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}/p5-studio-list.png`, fullPage: true });
    expect(net.external).toEqual([]);
    expect(net.failed).toEqual([]);
    expect(errors).toEqual([]);
    await ctx2.close();
  });

  test('designs stay with their project: duplicate, delete with undo, and a lesson editor shortcut', async ({ page }) => {
    test.setTimeout(180_000);
    await lessonWithObjectives(page); // leaves the lesson editor open
    await page.getByTestId('lesson-new-design').click();
    const d = page.getByTestId('create-design-dialog');
    await expect(d.getByTestId('design-project-select')).toHaveValue(/.+/);
    await expect(d.getByTestId('design-lesson-select')).toHaveValue(/.+/);
    await d.getByTestId('kind-summary').check();
    await expect(d.getByTestId('design-from-lesson')).toBeChecked();
    await d.getByTestId('design-title-input').fill('أهداف الدرس');
    await d.getByTestId('create-design-save').click();
    // started from the lesson objectives
    await expect(page.getByTestId('point-title-input')).toHaveCount(2);
    await expect(page.getByTestId('point-title-input').first()).toHaveValue('أن يعدّد الطالب مصادر الطاقة المتجددة.');
    await waitSaved(page);
    await page.getByTestId('duplicate-design').click();
    await expect(page.getByTestId('design-title-field')).toHaveValue('أهداف الدرس (نسخة)');
    await page.getByTestId('delete-design').click();
    await page.getByTestId('confirm-delete-design').getByRole('button', { name: 'حذف التصميم' }).click();
    await expect(page.getByTestId('page-studio')).toBeVisible();
    await expect(page.getByTestId('design-tile')).toHaveCount(1);
    await page.getByRole('button', { name: 'تراجع' }).click();
    await expect(page.getByTestId('design-title-field')).toHaveValue('أهداف الدرس (نسخة)');
    await page.goto('./#/studio');
    await expect(page.getByTestId('design-tile')).toHaveCount(2);
    await page.getByTestId('design-kind-filter').selectOption('conceptmap');
    await expect(page.getByTestId('design-tile')).toHaveCount(0);
    await page.getByTestId('design-kind-filter').selectOption('');
    await page.getByTestId('design-search').fill('نسخة');
    await expect(page.getByTestId('design-tile')).toHaveCount(1);
  });
});
