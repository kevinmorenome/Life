// Regenerates the app icons in public/ from scripts/icon-source.png (the rounded "L" tile).
//   node scripts/make-icons.mjs
// The source has white corners, so crop inside the tile and let iOS/Android apply their own mask.
import sharp from 'sharp';

const src = 'scripts/icon-source.png';
const crop = { left: 170, top: 170, width: 920, height: 920 };

const out = [
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/apple-touch-icon.png', 180],
  // The L sits well inside the central 80% safe zone, so the same art works maskable.
  ['public/icon-maskable-512.png', 512],
];
for (const [file, size] of out) {
  await sharp(src).extract(crop).resize(size, size).png().toFile(file);
  console.log('wrote', file);
}
