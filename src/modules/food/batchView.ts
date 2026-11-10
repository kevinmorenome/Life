import { money, shortDate } from '../../lib/format';
import { historyNotes, historyText } from './batchHistory';
import type { ProductSummary, Purchase } from './products';
import { daysBetween, originBatch, type Batch, type HistoryEntry, type Stock } from './stock';
import { STORAGE_LABELS } from './types';

/**
 * What the product page and the stock sheet show about batches, worked out from `stockOf()`: a product is a set of
 * purchases, each with its own life, so everything said about the product here is added up from its batches.
 */

/** Semantic colours: green = fresh / done well, orange = soon, red = past date / thrown away, blue = freezer, grey = everything else. */
export type Tone = 'green' | 'orange' | 'red' | 'blue' | 'grey';

/** A badge says one thing of one kind: how fresh it is, where it is, or how much of it was used. They are never mixed up. */
export interface Badge {
  kind: 'expiry' | 'storage' | 'usage';
  text: string;
  tone: Tone;
}

/** A batch counts as expiring soon with this many days or fewer to its use-by date. */
export const SOON_DAYS = 3;

const EPS = 1e-9;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The purchase a batch came from (also for the frozen and thawed parts of it); undefined for stock that only came from a count. */
export function purchaseOf(product: Pick<ProductSummary, 'purchases'>, b: Pick<Batch, 'id'>): Purchase | undefined {
  const origin = b.id ? originBatch(b.id) : undefined;
  return origin ? product.purchases.find((p) => p.batch === origin) : undefined;
}

/** Where a batch came from in one line: "bought 31 Oct 2026 · Konzum · €1.89 / kg", or "counted …" for stock that only came from a count. */
export function batchOrigin(product: Pick<ProductSummary, 'purchases'>, b: Batch): string {
  const purchase = purchaseOf(product, b);
  if (!purchase) return `counted ${shortDate(b.date)}`;
  return `bought ${shortDate(purchase.date)} · ${purchase.store} · ${money(purchase.unitPrice)}${purchase.unit === 'pc' ? '' : ` / ${purchase.unit}`}`;
}

/** Purchases are numbered in the order they were bought, so a batch keeps its number as newer ones arrive. */
export function batchNumber(product: Pick<ProductSummary, 'purchases'>, b: Pick<Batch, 'id'>): number | undefined {
  const purchase = purchaseOf(product, b);
  if (!purchase) return undefined;
  // The list is newest first; turned around, purchases of the same day keep the order of their receipts.
  const oldestFirst = [...product.purchases].reverse().sort((x, y) => x.date.localeCompare(y.date));
  return oldestFirst.indexOf(purchase) + 1;
}

/** "Batch #2"; stock that only came from a count has no purchase to number. */
export function batchTitle(product: Pick<ProductSummary, 'purchases'>, b: Pick<Batch, 'id'>): string {
  const n = batchNumber(product, b);
  return n ? `Batch #${n}` : 'Counted stock';
}

/** How much a batch started with: what was bought, counted, or moved into (or out of) the freezer to make it. */
export function originalQuantity(history: HistoryEntry[] | undefined): number | undefined {
  const first = history?.find((h) => h.kind === 'bought' || h.kind === 'counted' || h.kind === 'frozen' || h.kind === 'thawed');
  return first?.quantity;
}

/** How much of a batch is gone for good (used, thrown away, counted down): what went to the freezer is not used. */
export function usedOf(b: Pick<Batch, 'quantity'>, history: HistoryEntry[] | undefined): number {
  const original = originalQuantity(history);
  if (original === undefined) return 0;
  const moved = (history ?? []).filter((h) => h.kind === 'moved-out').reduce((sum, h) => sum + (h.quantity ?? 0), 0);
  return Math.max(0, round3(original - moved - b.quantity));
}

/** Fresh, expiring soon or past date, from the batch's own use-by; nothing for what has no date. What is frozen is only flagged once its date is near. */
export function expiryBadge(b: Pick<Batch, 'useBy' | 'frozen'>, today: string): Badge | undefined {
  if (!b.useBy) return undefined;
  const left = daysBetween(today, b.useBy);
  if (left < 0) return { kind: 'expiry', text: 'Past date', tone: 'red' };
  if (left <= SOON_DAYS) return { kind: 'expiry', text: 'Expiring soon', tone: 'orange' };
  return b.frozen ? undefined : { kind: 'expiry', text: 'Fresh', tone: 'green' };
}

/** Where a batch is: the freezer once frozen, out of it again once thawed, otherwise where the product is kept. */
export function storageBadge(product: Pick<ProductSummary, 'storage'>, b: Pick<Batch, 'frozen' | 'thawed'>): Badge {
  if (b.frozen) return { kind: 'storage', text: 'Frozen', tone: 'blue' };
  if (b.thawed) return { kind: 'storage', text: 'Thawed', tone: 'orange' };
  return { kind: 'storage', text: STORAGE_LABELS[product.storage], tone: product.storage === 'freezer' ? 'blue' : 'grey' };
}

/** Partly used once some of it is gone; "Unopened" only for a purchase nothing was taken from or moved out of. */
export function usageBadge(b: Pick<Batch, 'quantity'>, history: HistoryEntry[] | undefined): Badge | undefined {
  if (usedOf(b, history) > EPS) return { kind: 'usage', text: 'Partially used', tone: 'grey' };
  const untouched = history?.[0]?.kind === 'bought' && !history.some((h) => h.kind === 'moved-out');
  return untouched ? { kind: 'usage', text: 'Unopened', tone: 'grey' } : undefined;
}

/** The badges of a batch you still have: at most one of each kind, freshness first. */
export function batchBadges(product: Pick<ProductSummary, 'storage'>, b: Batch, history: HistoryEntry[] | undefined, today: string): Badge[] {
  return [expiryBadge(b, today), storageBadge(product, b), usageBadge(b, history)].filter((x): x is Badge => !!x);
}

/** How a batch that is gone ended, and when: finished, thrown away, moved to the freezer… read from the end of its history. */
export function pastStatus(history: HistoryEntry[] | undefined): Badge & { date?: string; undated?: boolean } {
  for (const h of [...(history ?? [])].reverse()) {
    const at = { date: h.date, ...(h.undated ? { undated: true } : {}) };
    if (h.kind === 'finished') return { kind: 'usage', text: h.undated ? 'Used earlier' : 'Finished', tone: 'green', ...at };
    if (h.kind === 'used') return { kind: 'usage', text: 'Finished', tone: 'green', ...at };
    if (h.kind === 'tossed') return { kind: 'usage', text: 'Discarded', tone: 'red', ...at };
    if (h.kind === 'adjusted') return { kind: 'usage', text: 'Counted out', tone: 'grey', ...at };
    if (h.kind === 'assumed-eaten') return { kind: 'usage', text: 'Assumed eaten', tone: 'grey', ...at };
    if (h.kind === 'moved-out') return h.to === 'freezer' ? { kind: 'storage', text: 'Moved to freezer', tone: 'blue', ...at } : { kind: 'storage', text: 'Taken out', tone: 'grey', ...at };
  }
  return { kind: 'usage', text: 'Gone', tone: 'grey' };
}

/** The top of the product page: everything here is counted from the batches, never stored. */
export interface Overview {
  /** Batches with something left. */
  active: number;
  /** Batches within `SOON_DAYS` of their use-by date. */
  soon: number;
  /** Batches past their use-by date. */
  past: number;
  /** Where the batches are, e.g. ["Fridge", "Freezer"]: one product can be in two places. */
  places: string[];
  /** The few badges worth showing, most pressing first. */
  badges: Badge[];
}

const plural = (n: number, text: string) => (n === 1 ? text : `${n} ${text.toLowerCase()}`);

export function overviewOf(product: Pick<ProductSummary, 'storage'>, stock: Stock, today: string): Overview {
  const base = { active: 0, soon: 0, past: 0, places: [STORAGE_LABELS[product.storage]] };
  if (stock.quantity <= 0) return { ...base, badges: [{ kind: 'usage', text: 'Used up', tone: 'grey' }] };

  const expiry = stock.batches.map((b) => expiryBadge(b, today)?.tone);
  const past = expiry.filter((t) => t === 'red').length;
  const soon = expiry.filter((t) => t === 'orange').length;
  const fresh = expiry.filter((t) => t === 'green').length;
  const frozen = stock.batches.filter((b) => b.frozen).length;
  const thawed = stock.batches.filter((b) => b.thawed).length;
  const partly = stock.batches.filter((b) => b.id && usedOf(b, stock.history[b.id]) > EPS).length;
  const places = [...new Set(stock.batches.map((b) => (b.frozen ? STORAGE_LABELS.freezer : STORAGE_LABELS[product.storage])))];

  const badges: Badge[] = [];
  if (past) badges.push({ kind: 'expiry', text: plural(past, 'Past date'), tone: 'red' });
  if (soon) badges.push({ kind: 'expiry', text: plural(soon, 'Expiring soon'), tone: 'orange' });
  if (thawed) badges.push({ kind: 'storage', text: plural(thawed, 'Thawed'), tone: 'orange' });
  if (fresh) badges.push({ kind: 'expiry', text: plural(fresh, 'Fresh'), tone: 'green' });
  if (frozen) badges.push({ kind: 'storage', text: plural(frozen, 'Frozen'), tone: 'blue' });
  if (partly) badges.push({ kind: 'usage', text: plural(partly, 'Partially used'), tone: 'grey' });
  return { active: stock.batches.length, soon, past, places, badges: badges.slice(0, 4) };
}

/** Days to a use-by date in words: "today", "tomorrow", "in 4 days", "3 days ago". */
export function dueText(left: number): string {
  if (left === 0) return 'today';
  if (left === 1) return 'tomorrow';
  if (left === -1) return 'yesterday';
  return left > 0 ? `in ${left} days` : `${-left} days ago`;
}

/** One line of the product's activity. */
export interface ActivityItem {
  key: string;
  /** The day it happened; for `undated` lines only the day it was logged. */
  date: string;
  undated?: boolean;
  text: string;
  tone: Tone;
  /** The batch it happened to, e.g. "Batch #2". */
  batch?: string;
  /** "via Claude", "weekly check", "not in statistics", the store of a purchase. */
  notes: string[];
}

const ACTIVITY_TONE: Partial<Record<HistoryEntry['kind'], Tone>> = { bought: 'green', finished: 'green', tossed: 'red', frozen: 'blue', thawed: 'orange' };

/** What a line of history says in the activity list. `amount` writes a quantity with its unit, `day` a date. */
export function activityText(h: HistoryEntry, amount: (q: number) => string, day: (iso: string) => string): string {
  const q = h.quantity === undefined ? '' : amount(Math.abs(h.quantity));
  if (h.kind === 'bought') return `Purchased ${q}`;
  if (h.kind === 'tossed') return `Discarded ${q}`;
  if (h.kind === 'finished') return h.undated ? `Used earlier${q ? ` (${q})` : ''}` : `Finished${q ? ` the last ${q}` : ''}`;
  if (h.kind === 'expiry') return h.useBy ? `Use-by date changed to ${day(h.useBy)}` : 'Use-by date changed';
  if (h.kind === 'counted') return `Counted ${q}`;
  if (h.kind === 'confirmed') return `Still have ${q}`;
  return historyText(h, amount);
}

/**
 * Everything that happened to a product, newest first: each batch's history in one list, so batches that are gone
 * stay in it. Putting food in the freezer is one line (on the batch it came from), not two.
 */
export function activityOf(product: Pick<ProductSummary, 'purchases'>, stock: Stock, amount: (q: number) => string, day: (iso: string) => string): ActivityItem[] {
  type Row = ActivityItem & { at: string };
  const rows: Row[] = [];
  const all = Object.entries(stock.history);
  const moved = new Set(all.flatMap(([, entries]) => entries.filter((h) => h.kind === 'moved-out' && h.eventId).map((h) => h.eventId)));
  for (const [id, entries] of all) {
    const purchase = purchaseOf(product, { id });
    entries.forEach((h, i) => {
      if ((h.kind === 'frozen' || h.kind === 'thawed') && moved.has(h.eventId)) return;
      rows.push({
        key: `${id}-${h.eventId ?? 'p'}-${i}`,
        date: h.date,
        at: h.at ?? '',
        ...(h.undated ? { undated: true } : {}),
        text: activityText(h, amount, day),
        tone: h.kind === 'moved-out' ? (h.to === 'freezer' ? 'blue' : 'orange') : (ACTIVITY_TONE[h.kind] ?? 'grey'),
        batch: batchTitle(product, { id }),
        notes: [h.kind === 'bought' && purchase ? purchase.store : '', ...historyNotes(h)].filter(Boolean),
      });
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at)).map(({ at: _at, ...item }) => item);
}

/** An amount someone typed ("0,3", "1.5"): a number above zero (or zero when `allowZero`), never more than `max`; undefined when it isn't one. */
export function parseAmount(text: string, max?: number, allowZero = false): number | undefined {
  const cleaned = text.trim().replace(',', '.');
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n >= 10_000 || (n === 0 && !allowZero)) return undefined;
  return round3(max === undefined ? n : Math.min(n, max));
}
