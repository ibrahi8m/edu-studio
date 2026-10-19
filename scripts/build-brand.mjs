// Generates the brand assets shipped inside the app (run: npm run brand).
// The personal photo is ONLY cropped and resized — no retouching, no face edits.
import sharp from 'sharp';
import { mkdirSync, copyFileSync } from 'node:fs';

const out = 'public/brand';
mkdirSync(out, { recursive: true });

const photo = 'brand-src/ibrahim-original.jpeg';

// Head-and-shoulders portrait (4:5). Crop excludes the can and bottle on the desk.
await sharp(photo)
  .rotate()
  .extract({ left: 480, top: 140, width: 830, height: 1038 })
  .resize(720, 900)
  .webp({ quality: 86 })
  .toFile(`${out}/ibrahim-portrait.webp`);

// Square avatar centred on the face.
await sharp(photo)
  .rotate()
  .extract({ left: 560, top: 200, width: 760, height: 760 })
  .resize(320, 320)
  .webp({ quality: 86 })
  .toFile(`${out}/ibrahim-avatar.webp`);

// App icons from the robot mark.
const mark = 'brand-src/robot-mark.svg';
copyFileSync(mark, `${out}/robot-mark.svg`);
copyFileSync(mark, 'public/favicon.svg');
for (const size of [192, 512]) {
  await sharp(mark, { density: 300 }).resize(size, size).png().toFile(`public/icon-${size}.png`);
}
// Maskable: full-bleed background with the mark at 80% for the safe zone.
const inner = await sharp(mark, { density: 300 }).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0E1014' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile('public/icon-maskable-512.png');
await sharp(mark, { density: 300 }).resize(180, 180).png().toFile('public/apple-touch-icon.png');

console.log('brand assets written');
