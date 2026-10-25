// Turns a Whering wardrobe export into a Life import file, downloading and
// shrinking each photo so the file is self-contained.
//
//   node --experimental-strip-types scripts/import-whering.ts whering-export.json [out.json]
//     [--details whering-details.json]   per-item extras + outfits from Whering's API
//     [--currency EUR]                   display currency to set (default: the export's)
//
// Then in the app: Settings → Import items → pick the output file. Re-importing
// a newer file updates previously imported items and outfits.
// Don't commit either file: they contain your personal wardrobe data.

import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import {
  convertItem,
  convertOutfit,
  detailsToItem,
  exportCurrency,
  wheringId,
  type WheringDetails,
  type WheringItem,
  type WheringOutfit,
} from '../src/modules/clothes/importers/whering.ts';

const PHOTO_HOST = 'https://storage.googleapis.com/download/storage/v1/b/whering.appspot.com/';
const MAX_SIZE = 600;
const CONCURRENCY = 6;

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args.splice(i, 2)[1];
}
const detailsPath = flag('--details');
const currencyFlag = flag('--currency');
const [input, output = 'life-import-whering.json'] = args;
if (!input) {
  console.error(
    'Usage: node --experimental-strip-types scripts/import-whering.ts <whering-export.json> [out.json] [--details file] [--currency CODE]',
  );
  process.exit(1);
}

const exported = (JSON.parse(await readFile(input, 'utf8')) as { items: WheringItem[] }).items;
const details = detailsPath
  ? (JSON.parse(await readFile(detailsPath, 'utf8')) as { items: WheringDetails[]; outfits?: WheringOutfit[] })
  : { items: [], outfits: [] };
const detailsByUrl = new Map(details.items.map((d) => [d.imageUrl, d]));

// Archived pieces only exist in the details file (they still appear in outfits).
const exportedUrls = new Set(exported.map((i) => i.imageUrls?.[0]));
const archived = details.items.filter((d) => !exportedUrls.has(d.imageUrl));
const items: WheringItem[] = [...exported, ...archived.map(detailsToItem)];

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
const nowIso = new Date(now).toISOString();
const clothes = items.map((item, i) =>
  convertItem(item, i, {
    photo: photos[i],
    createdAt: new Date(now - i * 1000).toISOString(),
    updatedAt: nowIso,
    details: detailsByUrl.get(item.imageUrls?.[0] ?? ''),
  }),
);

const lifeIdByWheringId = new Map(details.items.map((d) => [d.itemId, wheringId({ category: '', imageUrls: [d.imageUrl] }, -1)]));
const outfits = (details.outfits ?? []).map((o) => convertOutfit(o, (id) => lifeIdByWheringId.get(id), { now: nowIso }));
const droppedPieces = (details.outfits ?? []).reduce(
  (n, o, i) => n + o.pieceIds.length - outfits[i].itemIds.length,
  0,
);

const currency = currencyFlag ?? exportCurrency(items);
const stores = {
  clothes,
  ...(outfits.length ? { outfits } : {}),
  ...(currency ? { settings: [{ id: 'app', currency, updatedAt: nowIso }] } : {}),
};

const ids = new Set(clothes.map((c) => c.id));
if (ids.size !== clothes.length) console.warn(`  warning: ${clothes.length - ids.size} duplicate ids`);

const json = JSON.stringify({ app: 'life', version: 1, exportedAt: new Date(now).toISOString(), stores });
await writeFile(output, json);
console.log(
  `Wrote ${output}: ${clothes.length} items (${archived.length} archived), ${photos.filter(Boolean).length} photos, ` +
    `${outfits.length} outfits${droppedPieces ? ` (${droppedPieces} unknown pieces dropped)` : ''}, ` +
    `currency ${currency ?? 'none'}, ${(json.length / 1e6).toFixed(1)} MB`,
);
