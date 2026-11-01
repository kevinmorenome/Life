// Adds Whering purchase dates to items already in the app, without touching anything else.
//
//   node --experimental-strip-types scripts/patch-purchase-dates.ts whering-details.json life-backup.json [out.json] [--timezone Europe/Madrid]
//
// 1. Settings → Export a backup from the app (it holds your current data).
// 2. Run this with the details file and that backup. Only items that have no purchase date yet
//    are written to out.json, with every other field exactly as in the backup.
// 3. Settings → Import items → pick out.json. Items you edited or wore since importing keep those changes.
// Dates are converted to the timezone given (default Europe/Madrid).
// Don't commit these files: they contain your personal wardrobe data.

import { readFile, writeFile } from 'node:fs/promises';
import { purchaseDateFrom, wheringId, type WheringDetails } from '../src/modules/clothes/importers/whering.ts';

const args = process.argv.slice(2);
const tzIndex = args.indexOf('--timezone');
const timeZone = tzIndex === -1 ? undefined : args.splice(tzIndex, 2)[1];
const [detailsPath, backupPath, output = 'life-purchase-dates.json'] = args;
if (!detailsPath || !backupPath) {
  console.error('Usage: node --experimental-strip-types scripts/patch-purchase-dates.ts <whering-details.json> <life-backup.json> [out.json]');
  process.exit(1);
}

const details = (JSON.parse(await readFile(detailsPath, 'utf8')) as { items: WheringDetails[] }).items;
const backup = JSON.parse(await readFile(backupPath, 'utf8')) as {
  app: string;
  stores: { clothes?: { id: string; purchaseDate?: string; updatedAt: string }[] };
};
if (backup.app !== 'life' || !backup.stores?.clothes) throw new Error('Not a Life backup file');

const nowIso = new Date().toISOString();
const byId = new Map(backup.stores.clothes.map((c) => [c.id, c]));
const patched = [];
let alreadySet = 0;
let noDate = 0;
let missing = 0;
for (const d of details) {
  const item = byId.get(wheringId({ category: '', imageUrls: [d.imageUrl] }, -1));
  if (!item) missing++;
  else if (item.purchaseDate) alreadySet++;
  else {
    const purchaseDate = purchaseDateFrom(d.dateAdded, nowIso, timeZone);
    if (!purchaseDate) noDate++;
    else patched.push({ ...item, purchaseDate, updatedAt: nowIso });
  }
}

const json = JSON.stringify({ app: 'life', version: 1, exportedAt: nowIso, stores: { clothes: patched } });
await writeFile(output, json);
console.log(
  `Wrote ${output}: ${patched.length} items get a purchase date; ${alreadySet} already had one, ` +
    `${noDate} have no usable date in Whering, ${missing} aren't in the backup.`,
);
