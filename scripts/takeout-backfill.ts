// Parses the PDFs of Wolt emails into item lines and prepares the calls to `attach_takeout_items`. Resumable: everything parsed
// goes into one cache file, so a rerun never parses (or downloads) a PDF twice.
//
//   node --experimental-strip-types scripts/takeout-backfill.ts parse   <pdf-dir> [cache.json]
//   node --experimental-strip-types scripts/takeout-backfill.ts dry-run [cache.json] [n=5] [--since=YYYY-MM-DD]
//   node --experimental-strip-types scripts/takeout-backfill.ts payload [cache.json] [out-dir] [per-file=25] [--since=YYYY-MM-DD]
//
// --since leaves out older orders (you won't remember them well enough to rate or mark them): dry-run and payload only look at orders on or after that date.
//   node --experimental-strip-types scripts/takeout-backfill.ts mark    <cache.json> <orderId>...   (after attach_takeout_items said attached / alreadyAttached)
//
// The Gmail connector can only be called from a Claude chat, so Claude downloads the PDFs into <pdf-dir> (see docs/takeout-backfill.md);
// this script needs `pdftotext` (poppler). Optional <pdf-dir>/manifest.json: [{ "messageId", "orderId"?, "total" (the email's "Ukupno EUR"), "date" }]
// lets the dry run compare items + fees with the total the email states. The cache holds personal order data: never commit it.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { groupItems, itemsSubtotal, optionChoice, parseReceiptText, type PdfItem } from '../src/modules/wolt/receiptPdf.ts';

interface Entry {
  orderId: string;
  venue?: string;
  date?: string;
  time?: string;
  orderType?: string;
  paymentMethod?: string;
  items?: PdfItem[];
  confirmationTotal?: number;
  feesTotal?: number;
  invoiceNo?: string;
  /** "Moj komentar" of the order, e.g. "Group Order". */
  comment?: string;
  /** Other people's payments in a group order ("Potvrda plaćanja"): what they paid and for what. Never attached. */
  others?: { paymentMethod?: string; total?: number; items: PdfItem[] }[];
  /** Email total from the manifest, when given. */
  emailTotal?: number;
  files: string[];
  /** True once attach_takeout_items accepted it. */
  attached?: boolean;
}
type Cache = { parsedFiles: Record<string, string>; orders: Record<string, Entry> };

const argv = process.argv.slice(2);
const since = argv.find((a) => a.startsWith('--since='))?.slice(8) ?? '';
if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('--since must be YYYY-MM-DD');
const [cmd, ...rest] = argv.filter((a) => !a.startsWith('--since='));
const load = (path: string): Cache => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { parsedFiles: {}, orders: {} });
const save = (path: string, c: Cache) => writeFileSync(path, JSON.stringify(c, null, 1));
const newest = (c: Cache) => Object.values(c.orders).filter((e) => e.items?.length && (e.date ?? '') >= since).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
const eur = (n?: number) => (n === undefined ? '—' : n.toFixed(2));

if (cmd === 'parse') {
  const [dir, cachePath = 'takeout-items.cache.json'] = rest;
  if (!dir) throw new Error('parse needs the folder with the PDFs');
  const cache = load(cachePath);
  const manifest: { orderId?: string; total?: number }[] = existsSync(join(dir, 'manifest.json')) ? JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) : [];
  let parsed = 0;
  let skipped = 0;
  const problems: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf')).sort()) {
    if (cache.parsedFiles[file]) {
      skipped++;
      continue;
    }
    const r = parseReceiptText(execFileSync('pdftotext', ['-layout', join(dir, file), '-'], { encoding: 'utf8', maxBuffer: 10_000_000 }));
    if (!r.orderId) {
      problems.push(`${file}: no "ID narudžbe" found`);
      continue;
    }
    if (r.kind === 'confirmation' && r.items.length === 0) {
      // Not cached, so it is read again after the parser is fixed.
      problems.push(`${file}: confirmation with no item lines parsed`);
      continue;
    }
    const e = (cache.orders[r.orderId] ??= { orderId: r.orderId, files: [] });
    e.files.push(file);
    if (r.kind === 'confirmation') {
      Object.assign(e, { venue: r.venue, date: r.date, time: r.time, orderType: r.orderType, paymentMethod: r.paymentMethod, items: r.items, confirmationTotal: r.total, comment: r.comment });
      if (r.total !== undefined && Math.abs(itemsSubtotal(r.items) - r.total) > 0.02) problems.push(`${file}: item lines add up to ${itemsSubtotal(r.items)} but the PDF total is ${r.total}`);
    } else if (r.kind === 'payment') {
      (e.others ??= []).push({ paymentMethod: r.paymentMethod, total: r.total, items: r.items });
      e.comment ??= r.comment;
    } else {
      e.feesTotal = r.total;
      e.invoiceNo = r.invoiceNo;
      e.date ??= r.date;
      e.time ??= r.time;
    }
    cache.parsedFiles[file] = r.orderId;
    parsed++;
  }
  for (const m of manifest) if (m.orderId && cache.orders[m.orderId] && m.total !== undefined) cache.orders[m.orderId].emailTotal = m.total;
  save(cachePath, cache);
  const all = Object.values(cache.orders);
  console.log(`Parsed ${parsed} new PDFs (${skipped} already in the cache). ${all.length} orders, ${all.filter((e) => e.items?.length).length} with items, ${all.filter((e) => e.items?.length && e.feesTotal === undefined).length} without a fee invoice.`);
  for (const p of problems) console.log(`! ${p}`);
} else if (cmd === 'dry-run') {
  const [cachePath = 'takeout-items.cache.json', n = '5'] = rest;
  const cache = load(cachePath);
  for (const e of newest(cache).slice(0, Number(n))) {
    const sub = itemsSubtotal(e.items!);
    const others = Math.round((e.others ?? []).reduce((s, o) => s + (o.total ?? 0), 0) * 100) / 100;
    const sum = Math.round((sub + (e.feesTotal ?? 0) + others) * 100) / 100;
    console.log(`\n${e.date} ${e.time ?? ''}  ${e.venue}  [${e.orderId}]  ${e.orderType ?? ''} · ${e.paymentMethod ?? ''}`);
    for (const g of groupItems(e.items!)) {
      const i = g.item;
      const extra = g.options.reduce((s, x) => s + x.linePrice, 0);
      if (g.kind === 'fee') console.log(`   fee  ${i.name.padEnd(46).slice(0, 46)} ${eur(i.linePrice).padStart(16)}`);
      else {
        console.log(`   ${String(i.qty).padStart(2)}×  ${i.name.padEnd(46).slice(0, 46)} ${eur(i.unitPrice).padStart(7)} ${eur(i.linePrice + extra).padStart(8)}  (${i.vat}%)`);
        const choices = g.options.map((x) => optionChoice(x.name)).filter(Boolean);
        if (choices.length) console.log(`        ↳ ${choices.join(', ')}${extra ? `  (+${eur(extra)} options)` : ''}`);
      }
    }
    const check = e.emailTotal === undefined ? 'no email total to compare' : Math.abs(e.emailTotal - sum) <= 0.02 ? 'matches the email total' : `DIFFERENT from email total ${eur(e.emailTotal)} (tip or other extra?)`;
    if (e.others?.length) {
      console.log(`   GROUP ORDER (${e.comment ?? ''}): ${e.others.length} other payment(s) — decide which items were not yours (set_item_owner):`);
      for (const o of e.others) console.log(`      ${o.paymentMethod ?? '?'} ${eur(o.total)}: ${o.items.map((i) => `${i.qty}× ${i.name}`).join('; ')}`);
    } else if (e.comment) console.log(`   comment: ${e.comment}`);
    console.log(`   items ${eur(sub)} + fees ${eur(e.feesTotal)}${others ? ` + others ${eur(others)}` : ''} = ${eur(sum)}  → ${check}`);
  }
  console.log('\nNothing was written. Next: payload, then attach_takeout_items.');
} else if (cmd === 'payload') {
  const [cachePath = 'takeout-items.cache.json', outDir = 'takeout-payloads', per = '25'] = rest;
  const cache = load(cachePath);
  const todo = Object.values(cache.orders).filter((e) => e.items?.length && !e.attached && (e.date ?? '') >= since).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  mkdirSync(outDir, { recursive: true });
  const size = Math.max(1, Number(per));
  for (let i = 0; i * size < todo.length; i++) {
    const orders = todo.slice(i * size, (i + 1) * size).map((e) => ({ sourceId: e.orderId, items: e.items, paymentMethod: e.paymentMethod, orderType: e.orderType, feesTotal: e.feesTotal, invoiceNo: e.invoiceNo, othersTotal: e.others?.length ? Math.round(e.others.reduce((s, o) => s + (o.total ?? 0), 0) * 100) / 100 : undefined }));
    writeFileSync(join(outDir, `attach-${String(i + 1).padStart(3, '0')}.json`), JSON.stringify({ orders }));
  }
  console.log(`${todo.length} orders to attach in ${Math.ceil(todo.length / size)} files in ${outDir}/ (each file is the arguments of one attach_takeout_items call).`);
} else if (cmd === 'mark') {
  const [cachePath, ...ids] = rest;
  const cache = load(cachePath);
  for (const id of ids) if (cache.orders[id]) cache.orders[id].attached = true;
  save(cachePath, cache);
  console.log(`Marked ${ids.filter((id) => cache.orders[id]).length} orders as attached.`);
} else {
  console.error('Usage: takeout-backfill.ts parse|dry-run|payload|mark ... (see the top of the file)');
  process.exit(1);
}
