import type { Purchase } from './products';
import type { ProductType, StockEvent, Unit } from './types';

/** How long food keeps once frozen, counted from the day it went in (change it per batch with its use-by date). */
export const FREEZER_DAYS = 90;
/** How long thawed food keeps once it is out of the freezer. */
export const THAW_DAYS = 2;
/** Snacks are assumed eaten after this many days unless you say otherwise. */
export const SNACK_DAYS = 3;
/** How long fresh things keep when the product has no shelf life set. */
export const DEFAULT_FRESH_DAYS = 5;
/** Days after which an item is worth asking about in the weekly check, by type (snacks never: they are assumed gone). */
const CHECK_AFTER_DAYS: Partial<Record<ProductType, number>> = { fresh: 4, staple: 14, drink: 14 };

/** Days after which things that are all in the freezer are worth asking about in the weekly check. */
const FROZEN_CHECK_DAYS = 60;

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
  /** The purchase it came from (see `Purchase.batch`); absent for stock that only came from a count. */
  id?: string;
  /** Use-by date: the one set by hand, or the purchase date plus the product's shelf life (fresh items, or when a shelf life is set), or the freezing day plus `FREEZER_DAYS`. */
  useBy?: string;
  /** The day it went into the freezer; absent when it is not frozen. */
  frozen?: string;
}

/** The purchase a batch came from: frozen and thawed batches are named `<freeze|thaw>-<event id>:<source batch>`, so this follows them back to the receipt line. */
export function originBatch(id: string): string {
  let out = id;
  while (/^(freeze|thaw)-/.test(out)) out = out.slice(out.indexOf(':') + 1);
  return out;
}

export type StockStatus = 'ok' | 'use-soon' | 'check' | 'low' | 'out';

export interface Stock {
  /** False for products you only have or don't (`trackAmount` off): then `quantity` is 1 (have it) or 0 (out). */
  tracked: boolean;
  quantity: number;
  /** Oldest first. */
  batches: Batch[];
  /** Fresh items: the date the first batch to go off should be used by. */
  useBy?: string;
  /** How much of `quantity` is in the freezer. */
  frozenQuantity: number;
  /** Last day a purchase or a count confirmed what you have. */
  lastConfirmed?: string;
  status: StockStatus;
}

interface Op {
  date: string;
  /** Orders things on the same day: purchases first, then events by when they were recorded. */
  order: string;
  /** Breaks a tie at the same instant: a count comes first, so what is recorded with it counts as after it. */
  rank: number;
  apply(batches: Work[]): void;
}

/** A batch while stock is being worked out: `useBy` is only the one set by hand, and empty batches stay (a batch count can refill them). */
interface Work {
  id?: string;
  date: string;
  quantity: number;
  useBy?: string;
  frozen?: string;
}

/** Soonest to expire first, otherwise oldest first. `key` is a batch's use-by, or its date when it has none. */
function byExpiry(key: (b: Work) => string) {
  return (a: Work, b: Work) => key(a).localeCompare(key(b)) || a.date.localeCompare(b.date);
}

/** Takes `amount` from the batches, the ones that expire first (or are oldest) first; never goes below zero. */
function consume(batches: Work[], amount: number, key: (b: Work) => string): void {
  let left = amount;
  for (const b of batches.filter((x) => x.quantity > 1e-9).sort(byExpiry(key))) {
    if (left <= 1e-9) break;
    const take = Math.min(b.quantity, left);
    b.quantity = round3(b.quantity - take);
    left -= take;
  }
}

/**
 * What you have of a product, batch by batch. Each purchase is a batch with its own use-by date. A use or a
 * throw-away names a batch, or comes off the batch that expires first. A count (weekly check, "I have 3")
 * trims the stock to that number, oldest first, or adds the difference as a new batch; a count that names a
 * batch sets that batch (which is also how an undo puts it back). A use-by set by hand replaces the default.
 * A purchase on the day of a count is taken as already included in the count.
 */
export function stockOf(
  product: { type: ProductType; shelfLifeDays?: number; trackAmount?: boolean; packSize?: number },
  purchases: (Pick<Purchase, 'date' | 'quantity'> & { batch?: string })[],
  events: StockEvent[],
  today: string,
): Stock {
  if (product.trackAmount === false) return presenceOf(purchases, events);
  // With a pack size, stock is counted in items: each pack bought adds that many.
  const perPack = product.packSize && product.packSize > 1 ? product.packSize : 1;
  if (perPack > 1) purchases = purchases.map((p) => ({ ...p, quantity: p.quantity * perPack }));
  const keeps = product.shelfLifeDays ?? (product.type === 'fresh' ? DEFAULT_FRESH_DAYS : undefined);
  const mine = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const useByOf = (b: Work) => b.useBy ?? (b.frozen ? addDays(b.frozen, FREEZER_DAYS) : keeps ? addDays(b.date, keeps) : undefined);
  const keyOf = (b: Work) => useByOf(b) ?? b.date;
  // A count confirms what it leaves: snacks past their days and fresh food past its use-by start again from the count.
  const stale = (b: Work, day: string) => {
    if (product.type === 'snack' && !b.frozen) return daysBetween(b.date, day) > SNACK_DAYS;
    const by = useByOf(b);
    return !!by && day > by;
  };

  const ops: Op[] = [];
  for (const p of purchases) {
    ops.push({ date: p.date, order: '', rank: 0, apply: (b) => b.push({ id: p.batch, date: p.date, quantity: p.quantity }) });
  }
  for (const e of mine) {
    ops.push({
      date: e.date,
      order: e.createdAt,
      rank: e.type === 'count' && !e.batch ? 0 : 1,
      apply: (b) => {
        const target = e.batch ? b.find((x) => x.id === e.batch) : undefined;
        if (e.type === 'expiry') {
          if (target && e.useBy) target.useBy = e.useBy;
        } else if (e.type === 'freeze' || e.type === 'thaw') {
          // Moves some of a batch (or of whatever expires first) into a batch that is frozen, or back out of the freezer.
          const freezing = e.type === 'freeze';
          if (target && !!target.frozen === freezing) return;
          let left = e.quantity;
          const sources = target ? [target] : b.filter((x) => x.quantity > 1e-9 && !!x.frozen !== freezing).sort(byExpiry(keyOf));
          for (const src of sources) {
            if (left <= 1e-9) break;
            const take = round3(Math.min(src.quantity, left));
            src.quantity = round3(src.quantity - take);
            left -= take;
            b.push({ id: `${e.type}-${e.id}:${src.id ?? 'n'}`, date: src.date, quantity: take, ...(freezing ? { frozen: e.date } : { useBy: addDays(e.date, THAW_DAYS) }) });
          }
        } else if (e.type === 'count') {
          if (e.batch) {
            if (target) target.quantity = round3(Math.max(0, e.quantity));
            return;
          }
          const total = round3(b.reduce((s, x) => s + x.quantity, 0));
          if (e.quantity < total) consume(b, round3(total - e.quantity), keyOf);
          else if (e.quantity > total) b.push({ id: `count-${e.id}`, date: e.date, quantity: round3(e.quantity - total) });
          for (const x of b) if (x.quantity > 1e-9 && stale(x, e.date)) Object.assign(x, { date: e.date, useBy: undefined });
        } else if (target && target.quantity > 1e-9) {
          target.quantity = round3(target.quantity - Math.min(target.quantity, e.quantity));
        } else {
          consume(b, e.quantity, keyOf);
        }
      },
    });
  }
  ops.sort((a, b) => a.date.localeCompare(b.date) || a.order.localeCompare(b.order) || a.rank - b.rank);
  const batches: Work[] = [];
  for (const op of ops) op.apply(batches);
  batches.sort((a, b) => a.date.localeCompare(b.date));

  // Snacks are assumed eaten after a few days.
  const kept = (product.type === 'snack' ? batches.filter((b) => b.frozen || daysBetween(b.date, today) <= SNACK_DAYS) : batches).filter((b) => b.quantity > 1e-9);
  const quantity = round3(kept.reduce((s, b) => s + b.quantity, 0));

  const lastBought = purchases.reduce<string | undefined>((m, p) => (!m || p.date > m ? p.date : m), undefined);
  const lastCount = [...mine].reverse().find((e) => e.type === 'count' && !e.batch);
  const lastConfirmed = [lastCount?.date, lastBought].filter((d): d is string => !!d).sort().pop();

  const out: Batch[] = kept.map((b) => {
    const useBy = useByOf(b);
    return { date: b.date, quantity: b.quantity, ...(b.id ? { id: b.id } : {}), ...(useBy ? { useBy } : {}), ...(b.frozen ? { frozen: b.frozen } : {}) };
  });
  const frozenQuantity = round3(out.filter((b) => b.frozen).reduce((sum, b) => sum + b.quantity, 0));
  const useBy = out.map((b) => b.useBy).filter((d): d is string => !!d).sort()[0];

  let status: StockStatus = 'ok';
  if (quantity === 0) status = 'out';
  else if (useBy && today > useBy) status = 'check';
  else if (useBy && daysBetween(today, useBy) <= 1) status = 'use-soon';
  else if ((product.type === 'staple' || product.type === 'drink') && quantity <= 1) status = 'low';

  return { tracked: true, quantity, batches: out, useBy, frozenQuantity, lastConfirmed, status };
}

/**
 * A product you only have or don't (spices, oil): you have it from the first purchase until you say it is
 * finished or thrown away, and buying it again puts it back. Uses never lower anything.
 */
function presenceOf(purchases: Pick<Purchase, 'date' | 'quantity'>[], events: StockEvent[]): Stock {
  const resets = events.filter((e) => e.type === 'count' || e.type === 'toss').sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const reset = resets[resets.length - 1];
  const lastBought = purchases.reduce<string | undefined>((m, p) => (!m || p.date > m ? p.date : m), undefined);
  const boughtAfter = purchases.some((p) => !reset || p.date > reset.date);
  const have = reset ? (reset.type === 'count' && reset.quantity > 0) || boughtAfter : purchases.length > 0;
  const lastConfirmed = [reset?.type === 'count' && reset.quantity > 0 ? reset.date : undefined, lastBought].filter((d): d is string => !!d).sort().pop();
  return { tracked: false, frozenQuantity: 0, quantity: have ? 1 : 0, batches: have && lastConfirmed ? [{ date: lastConfirmed, quantity: 1 }] : [], lastConfirmed, status: have ? 'ok' : 'out' };
}

/** How many times a product was used on or after `since` (for products that are only "have it", where a use changes nothing else). */
export function usesSince(events: StockEvent[], since?: string): number {
  return events.filter((e) => e.type === 'use' && (!since || e.date >= since)).length;
}

/** Worth asking about in the weekly check: it is past its use-by date, or nothing has confirmed it for a while. */
export function needsCheck(type: ProductType, s: Stock, today: string): boolean {
  if (s.quantity <= 0 || !s.tracked) return false;
  if (s.status === 'check') return true;
  // What is all in the freezer keeps for months: it is only worth a look now and then.
  if (s.batches.length > 0 && s.batches.every((b) => b.frozen)) return !!s.lastConfirmed && daysBetween(s.lastConfirmed, today) >= FROZEN_CHECK_DAYS;
  const after = CHECK_AFTER_DAYS[type];
  return after !== undefined && !!s.lastConfirmed && daysBetween(s.lastConfirmed, today) >= after;
}

/** Quantity worth showing: "3", "0.48", never "0.4800000001". */
export const formatQty = (n: number): string => String(round3(n));

/** What can be said about how much of the open pack is left: "three quarters", "half", "a quarter", "almost gone". */
export const LEVELS = [
  { fraction: 0.75, label: '¾ left' },
  { fraction: 0.5, label: '½ left' },
  { fraction: 0.25, label: '¼ left' },
  { fraction: 0.1, label: 'Almost gone' },
] as const;

/** How full the pack in use is (1 = unopened): the part after the whole packs. Weighed and poured goods have no packs. */
function openLevel(quantity: number, unit: Unit): number {
  if (unit !== 'pc') return 1;
  const part = quantity - Math.floor(quantity + 1e-9);
  return part < 1e-9 ? 1 : round3(part);
}

/**
 * How much there is once the pack in use (or, for kg/l, what you have) is down to `fraction`. For pieces the
 * packs you haven't opened stay whole: 2 packs, the open one at half → 1½. Never more than you have now.
 */
export function partLeft(quantity: number, unit: Unit, fraction: number): number {
  if (quantity <= 0) return 0;
  const next = unit === 'pc' ? Math.ceil(quantity - 1e-9) - 1 + fraction : quantity * fraction;
  return round3(Math.min(next, quantity));
}

/** The "part left" choices that actually lower what you have (¼ left makes no sense for a pack that is already at ⅛). */
export function levelOptions(quantity: number, unit: Unit, packSize?: number): { fraction: number; label: string }[] {
  // Counted in items (cans): a can isn't "half left"; say how many are left instead.
  if (quantity <= 0 || (packSize && packSize > 1)) return [];
  const level = openLevel(quantity, unit);
  return LEVELS.filter((l) => l.fraction < level - 1e-9);
}

const GLYPHS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };

/** A quantity as people say it: pieces in quarters ("1½", "¼"), kg and l with at most two decimals (stock is kept to the gram). */
export function formatAmount(quantity: number, unit: Unit): string {
  if (unit !== 'pc') {
    const two = Math.round(quantity * 100) / 100;
    return two === 0 && quantity > 0 ? formatQty(quantity) : String(two);
  }
  const whole = Math.floor(quantity + 1e-9);
  const glyph = GLYPHS[String(round3(quantity - whole))];
  if (glyph) return whole ? `${whole}${glyph}` : glyph;
  return formatQty(quantity);
}
