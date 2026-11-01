import type { Purchase } from './products';
import type { ProductType, StockEvent } from './types';

/** Snacks are assumed eaten after this many days unless you say otherwise. */
export const SNACK_DAYS = 3;
/** How long fresh things keep when the product has no shelf life set. */
export const DEFAULT_FRESH_DAYS = 5;
/** Days after which an item is worth asking about in the weekly check, by type (snacks never: they are assumed gone). */
const CHECK_AFTER_DAYS: Partial<Record<ProductType, number>> = { fresh: 4, staple: 14, drink: 14 };

const DAY = 86_400_000;
const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY).toISOString().slice(0, 10);
}
export const daysBetween = (from: string, to: string): number => Math.round((toUtc(to) - toUtc(from)) / DAY);

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** What is left from one purchase (or from a count). */
export interface Batch {
  /** When it was bought or counted. */
  date: string;
  quantity: number;
}

export type StockStatus = 'ok' | 'use-soon' | 'check' | 'low' | 'out';

export interface Stock {
  quantity: number;
  /** Oldest first. */
  batches: Batch[];
  /** Fresh items: the date the oldest batch should be used by. */
  useBy?: string;
  /** Last day a purchase or a count confirmed what you have. */
  lastConfirmed?: string;
  status: StockStatus;
}

interface Op {
  date: string;
  /** Orders things on the same day: purchases first, then events by when they were recorded. */
  order: string;
  apply(batches: Batch[]): void;
}

function consume(batches: Batch[], amount: number): void {
  let left = amount;
  while (left > 1e-9 && batches.length) {
    const first = batches[0];
    if (first.quantity > left + 1e-9) {
      first.quantity = round3(first.quantity - left);
      left = 0;
    } else {
      left -= first.quantity;
      batches.shift();
    }
  }
}

/**
 * What you have of a product: the last count (if any), plus purchases after it, minus what was used or thrown
 * away after it, oldest first. A purchase on the day of a count is taken as already included in that count.
 */
export function stockOf(
  product: { type: ProductType; shelfLifeDays?: number },
  purchases: Pick<Purchase, 'date' | 'quantity'>[],
  events: StockEvent[],
  today: string,
): Stock {
  const mine = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const baseline = [...mine].reverse().find((e) => e.type === 'count');
  const batches: Batch[] = baseline && baseline.quantity > 0 ? [{ date: baseline.date, quantity: baseline.quantity }] : [];

  const ops: Op[] = [];
  for (const p of purchases) {
    if (baseline && p.date <= baseline.date) continue;
    ops.push({ date: p.date, order: '', apply: (b) => b.push({ date: p.date, quantity: p.quantity }) });
  }
  for (const e of mine) {
    if (e.type === 'count') continue;
    if (baseline && (e.date < baseline.date || (e.date === baseline.date && e.createdAt < baseline.createdAt))) continue;
    ops.push({ date: e.date, order: e.createdAt, apply: (b) => consume(b, e.quantity) });
  }
  ops.sort((a, b) => a.date.localeCompare(b.date) || a.order.localeCompare(b.order));
  for (const op of ops) op.apply(batches);
  batches.sort((a, b) => a.date.localeCompare(b.date));

  // Snacks are assumed eaten after a few days.
  const kept = product.type === 'snack' ? batches.filter((b) => daysBetween(b.date, today) <= SNACK_DAYS) : batches;
  const quantity = round3(kept.reduce((s, b) => s + b.quantity, 0));

  const lastBought = purchases.reduce<string | undefined>((m, p) => (!m || p.date > m ? p.date : m), undefined);
  const lastConfirmed = [baseline?.date, lastBought].filter((d): d is string => !!d).sort().pop();

  const keepsDays = product.shelfLifeDays ?? (product.type === 'fresh' ? DEFAULT_FRESH_DAYS : undefined);
  const useBy = quantity > 0 && keepsDays && kept[0] ? addDays(kept[0].date, keepsDays) : undefined;

  let status: StockStatus = 'ok';
  if (quantity === 0) status = 'out';
  else if (useBy && today > useBy) status = 'check';
  else if (useBy && daysBetween(today, useBy) <= 1) status = 'use-soon';
  else if ((product.type === 'staple' || product.type === 'drink') && quantity <= 1) status = 'low';

  return { quantity, batches: kept, useBy, lastConfirmed, status };
}

/** Worth asking about in the weekly check: it is past its use-by date, or nothing has confirmed it for a while. */
export function needsCheck(type: ProductType, s: Stock, today: string): boolean {
  if (s.quantity <= 0) return false;
  if (s.status === 'check') return true;
  const after = CHECK_AFTER_DAYS[type];
  return after !== undefined && !!s.lastConfirmed && daysBetween(s.lastConfirmed, today) >= after;
}

/** Quantity worth showing: "3", "0.48", never "0.4800000001". */
export const formatQty = (n: number): string => String(round3(n));
