// Reads the text of a Wolt receipt PDF (Croatian, from `pdftotext -layout`) into order fields and item lines.
// Each Wolt email has two PDFs: "Potvrda narudžbe" (the restaurant's confirmation, with the items) and "Račun <no>"
// (Wolt's own invoice for delivery / service fees, no food). Tell them apart by title, never by attachment order.
// Pure and free of imports, so Node scripts, the Worker and tests can all use it.

export interface PdfItem {
  /** Name as printed, wrapped lines joined with a space. */
  name: string;
  /** VAT percent, e.g. 13. */
  vat: number;
  qty: number;
  unitPrice: number;
  linePrice: number;
}

export interface PdfReceipt {
  kind: 'confirmation' | 'invoice';
  /** "ID narudžbe": the sourceId of the order in the app. */
  orderId?: string;
  /** Invoice number of a fee invoice ("60298/1/23"). */
  invoiceNo?: string;
  venue?: string;
  /** "Dostava" = delivery. */
  orderType?: string;
  /** Local YYYY-MM-DD and HH:MM. */
  date?: string;
  time?: string;
  paymentMethod?: string;
  items: PdfItem[];
  /** "Ukupno u EUR (uklj. PDV)". */
  total?: number;
}

// U+200E / U+200F and the other invisible direction and zero-width marks Wolt puts around numbers.
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;

export const clean = (s: string) => s.replace(INVISIBLE, '').replace(/ /g, ' ');

/** "1.234,50" or "11,00" or "-0,85" → number; undefined when it isn't one. */
export function parseNumber(s: string): number | undefined {
  const t = clean(s).trim();
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$|^-?\d+(\.\d+)?$/.test(t)) return undefined;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : undefined;
}

const ROW = /^(.*?)\s*(\d+(?:,\d+)?)\s*%\s+(\d+(?:[.,]\d+)?)\s+(-?[\d.,]+)\s+(-?[\d.,]+)\s*$/;

/** The value on the line of a label, or on the first non-blank line below it ("Način plaćanja" has it below). */
function field(lines: string[], label: string, below = false): string | undefined {
  const i = lines.findIndex((l) => l.trim().startsWith(label));
  if (i < 0) return undefined;
  if (!below) return lines[i].trim().slice(label.length).trim() || undefined;
  const next = lines.slice(i + 1).find((l) => l.trim());
  return next?.trim() || undefined;
}

export function parseReceiptText(text: string): PdfReceipt {
  // A page break (form feed) can sit between two rows with no blank line, so it separates rows like one.
  const lines = clean(text).replace(/\f/g, '\n\n').split(/\r?\n/).map((l) => l.replace(/\s+$/, ''));
  const head = lines.find((l) => l.trim())?.trim() ?? '';
  const kind: PdfReceipt['kind'] = /^Potvrda narudžbe/i.test(head) ? 'confirmation' : 'invoice';
  const out: PdfReceipt = { kind, items: [] };
  if (kind === 'invoice') out.invoiceNo = head.match(/^Račun\s+(\S+)/i)?.[1];

  out.orderId = field(lines, 'ID narudžbe')?.replace(/\s+/g, '');
  out.venue = field(lines, 'Objekt');
  out.orderType = field(lines, 'Vrsta narudžbe');
  const when = field(lines, 'Vrijeme dostave')?.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (when) {
    out.date = `${when[3]}-${when[2].padStart(2, '0')}-${when[1].padStart(2, '0')}`;
    out.time = `${when[4].padStart(2, '0')}:${when[5]}`;
  }
  // "Revolut Pay      28,20" → the method without the amount.
  out.paymentMethod = field(lines, 'Način plaćanja', true)?.replace(/\s{2,}-?[\d.,]+$/, '').trim() || undefined;

  const start = lines.findIndex((l) => /^\s*Stavka\s+%\s*PDV/i.test(l));
  const end = lines.findIndex((l, i) => i > start && /^\s*Ukupno u EUR/i.test(l));
  if (end >= 0) out.total = parseNumber(lines[end].trim().split(/\s{2,}/).pop() ?? '');
  if (start < 0 || end < 0) return out;

  // Rows are separated by blank lines; a long name wraps above and/or below its numbers line.
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const l of lines.slice(start + 1, end)) {
    if (l.trim()) cur.push(l);
    else if (cur.length) (blocks.push(cur), (cur = []));
  }
  if (cur.length) blocks.push(cur);
  for (const block of blocks) {
    const at = block.findIndex((l) => ROW.test(l));
    if (at < 0) continue;
    const m = block[at].match(ROW)!;
    const name = [...block.slice(0, at).map((l) => l.trim()), m[1].trim(), ...block.slice(at + 1).map((l) => l.trim())].filter(Boolean).join(' ');
    const vat = parseNumber(m[2]);
    const qty = parseNumber(m[3]);
    const unitPrice = parseNumber(m[4]);
    const linePrice = parseNumber(m[5]);
    if (!name || vat === undefined || qty === undefined || unitPrice === undefined || linePrice === undefined) continue;
    out.items.push({ name, vat, qty, unitPrice, linePrice });
  }
  return out;
}

export interface MatchedReceipt {
  confirmation?: PdfReceipt;
  invoice?: PdfReceipt;
}

/** Both PDFs of one email, whichever order they came in. */
export function pairReceipts(texts: string[]): MatchedReceipt {
  const out: MatchedReceipt = {};
  for (const t of texts) {
    const r = parseReceiptText(t);
    if (r.kind === 'confirmation') out.confirmation ??= r;
    else out.invoice ??= r;
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Sum of the item lines. */
export const itemsSubtotal = (items: PdfItem[]) => round2(items.reduce((s, i) => s + i.linePrice, 0));

export interface ItemGroup<T> {
  /** Position of the line in the order's items (what shares and notes refer to). */
  index: number;
  item: T;
  kind: 'dish' | 'fee';
  /** "Group: choice" lines that follow a dish (sauce, base, size…): choices of that dish, not dishes of their own. */
  options: T[];
}

const FEE = /^(naknada|dostava|napojnica|servisna)\b/i;
const OPTION = /^[^:]{2,}:\s*\S/;

/**
 * Wolt prints a dish, then each choice made for it as its own row ("Odaberi umak: Teriyaki", often at 0,00), and fees such as
 * "Naknada za pakiranje" as ordinary rows. Rows starting with "Naknada" / "Dostava" / "Napojnica" are fees; a row with a
 * "Group: choice" shape after a dish is that dish's option; everything else is a dish. The raw rows are never changed, this is
 * only how they are read.
 */
export function groupItems<T extends { name: string }>(items: T[]): ItemGroup<T>[] {
  const out: ItemGroup<T>[] = [];
  items.forEach((item, index) => {
    if (FEE.test(item.name.trim())) {
      out.push({ index, item, kind: 'fee', options: [] });
      return;
    }
    const dish = [...out].reverse().find((g) => g.kind === 'dish');
    if (dish && OPTION.test(item.name)) dish.options.push(item);
    else out.push({ index, item, kind: 'dish', options: [] });
  });
  return out;
}

/** What was chosen: the text after the colon. The cutlery question ("Želiš li pribor…?") is not a choice worth showing. */
export function optionChoice(name: string): string | undefined {
  const [group, ...rest] = name.split(':');
  return /pribor|cutlery/i.test(group) ? undefined : rest.join(':').trim() || undefined;
}
