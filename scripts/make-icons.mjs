// Regenerates the app icons in public/ from the inline SVG below.
//   node scripts/make-icons.mjs
import sharp from 'sharp';

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#2f6f5e"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 24})" fill="none" stroke="#fff"
     stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 7.5a2 2 0 1 0-2-2"/>
    <path d="M12 7.5v1.2L3.6 15.1a1.5 1.5 0 0 0 .9 2.7h15a1.5 1.5 0 0 0 .9-2.7L12 8.7"/>
  </g>
</svg>`;

const out = [
  ['public/icon-192.png', 192, 96],
  ['public/icon-512.png', 512, 96],
  ['public/apple-touch-icon.png', 180, 96],
  // Maskable: extra padding so Android's circle/squircle crop keeps the hanger.
  ['public/icon-maskable-512.png', 512, 150],
];
for (const [file, size, pad] of out) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(file);
  console.log('wrote', file);
}
