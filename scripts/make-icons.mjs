// Regenerates the app icons in public/: the "Life" wordmark (Bricolage Grotesque ExtraBold outlines,
// stored in scripts/icon-wordmark.json) on the navy tile, with the dot of the i in yellow.
//   node scripts/make-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const { white, green, width, upm } = JSON.parse(readFileSync('scripts/icon-wordmark.json', 'utf8'));
const BG = '#2a2862', INK = '#f3f1fb', DOT = '#ffc928';

// Full-bleed square (the OS applies its own mask). The wordmark takes ~64% of the width, inside the
// maskable safe zone. Glyph y points up, so the path is flipped by the font transform baked into the JSON.
function svg(size, scale = 0.64) {
  const s = (size * scale) / width;
  const x = (size - width * s) / 2;
  const y = size / 2 + upm * 0.36 * s; // baseline so the x-height/ascender block is centred
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<rect width="${size}" height="${size}" fill="${BG}"/>` +
      `<g transform="translate(${x} ${y}) scale(${s})"><path d="${white}" fill="${INK}"/><path d="${green}" fill="${DOT}"/></g></svg>`,
  );
}

const out = [
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/apple-touch-icon.png', 180],
  ['public/icon-maskable-512.png', 512],
];
for (const [file, size] of out) {
  await sharp(svg(size), { density: 300 }).resize(size, size).png().toFile(file);
  console.log('wrote', file);
}
