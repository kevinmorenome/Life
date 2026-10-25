// Turns a Whering wardrobe export into a Life import file, downloading and
// shrinking each photo so the file is self-contained.
//
//   node --experimental-strip-types scripts/import-whering.ts whering-export.json [out.json]
//
// Then in the app: Settings → Import items → pick the output file.
// Don't commit either file: they contain your personal wardrobe data.

import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { convertItem, exportCurrency, type WheringItem } from '../src/modules/clothes/importers/whering.ts';

const PHOTO_HOST = 'https://storage.googleapis.com/download/storage/v1/b/whering.appspot.com/';
const MAX_SIZE = 600;
const CONCURRENCY = 6;

const [input, output = 'life-import-whering.json'] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node --experimental-strip-types scripts/import-whering.ts <whering-export.json> [out.json]');
  process.exit(1);
}

const items = (JSON.parse(await readFile(input, 'utf8')) as { items: WheringItem[] }).items;

async function photo(url: string | undefined): Promise<string | undefined> {
  // Only fetch Whering's own image bucket; the export file is untrusted input.
  if (!url?.startsWith(PHOTO_HOST)) return undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const webp = await sharp(Buffer.from(await res.arrayBuffer()))
        .trim() // cut-outs often have wide transparent margins
        .resize(MAX_SIZE, MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78, alphaQuality: 90 })
        .toBuffer();
      return `data:image/webp;base64,${webp.toString('base64')}`;
    } catch (e) {
      if (attempt === 3) console.warn(`  photo failed (${(e as Error).message}): ${url}`);
    }
  }
  return undefined;
}

const now = Date.now();
const photos: (string | undefined)[] = new Array(items.length);
let next = 0;
let done = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) {
      const i = next++;
      photos[i] = await photo(items[i].imageUrls?.[0]);
      if (++done % 20 === 0 || done === items.length) console.log(`  photos ${done}/${items.length}`);
    }
  }),
);

// Earlier entries in the export get newer timestamps, preserving its order.
const clothes = items.map((item, i) =>
  convertItem(item, i, { photo: photos[i], createdAt: new Date(now - i * 1000).toISOString() }),
);
const currency = exportCurrency(items);
const stores = {
  clothes,
  ...(currency ? { settings: [{ id: 'app', currency, updatedAt: new Date(now).toISOString() }] } : {}),
};

const ids = new Set(clothes.map((c) => c.id));
if (ids.size !== clothes.length) console.warn(`  warning: ${clothes.length - ids.size} duplicate ids`);

const json = JSON.stringify({ app: 'life', version: 1, exportedAt: new Date(now).toISOString(), stores });
await writeFile(output, json);
console.log(
  `Wrote ${output}: ${clothes.length} items, ${photos.filter(Boolean).length} photos, ` +
    `currency ${currency ?? 'none'}, ${(json.length / 1e6).toFixed(1)} MB`,
);
