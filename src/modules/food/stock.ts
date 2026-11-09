import type { Purchase } from './products';
import type { ProductType, StockEvent, Storage, Unit } from './types';

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

/** Things kept at home (shampoo, soap) last for months: they are only worth a look now and then. */
const HOME_CHECK_DAYS = 90;

const DAY = 86_400_000;
const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY).toISOString().slice(0, 10);
}
export const daysBetween = (from: string, to: string): number => Math.round((toUtc(to) - toUtc(from)) / DAY);

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The events as they count once corrections are applied: an `edit` event names another event and either moves it to
 * the day it really happened (which also gives a "date unknown" event its date) or removes it. The newest edit of an
 * event wins. Everything that reads stock events goes through this, so a removed event counts for nothing anywhere.
 */
export function effectiveEvents(events: StockEvent[]): StockEvent[] {
  const edits = new Map<string, StockEvent>();
  for (const e of events) {
    if (e.type !== 'edit' || !e.target) continue;
    const had = edits.get(e.target);
    if (!had || e.createdAt >= had.createdAt) edits.set(e.target, e);
  }
  if (edits.size === 0) return events.some((e) => e.type === 'edit') ? events.filter((e) => e.type !== 'edit') : events;
  const out: StockEvent[] = [];
  for (const e of events) {
    if (e.type === 'edit') continue;
    const edit = edits.get(e.id);
    if (!edit) out.push(e);
    else if (edit.removed) continue;
    else if (edit.newDate && /^\d{4}-\d{2}-\d{2}$/.test(edit.newDate) && (edit.newDate !== e.date || e.undated)) {
      const { undated: _undated, ...rest } = e;
      out.push({ ...rest, date: edit.newDate, edited: true });
    } else out.push(e);
  }
  return out;
}

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
  /** The day it was taken out of the freezer. Thawed food is not frozen again, and is meant to be used soon. */
  thawed?: string;
  /** The last day you said you still had it (weekly check, or a count of the product); absent when only the purchase confirms it. */
  confirmed?: string;
}

/** The purchase a batch came from: frozen and thawed batches are named `<freeze|thaw>-<event id>:<source batch>`, so this follows them back to the receipt line. */
export function originBatch(id: string): string {
  let out = id;
  while (/^(freeze|thaw)-/.test(out)) out = out.slice(out.indexOf(':') + 1);
  return out;
}

/** What happened to a batch. */
export type HistoryKind =
  | 'bought' // the purchase
  | 'counted' // made by a count, or set to this amount by one
  | 'used'
  | 'tossed'
  | 'finished' // counted down to nothing
  | 'adjusted' // a count of the whole product took (negative) some off it
  | 'moved-out' // part of it went into the freezer, or was taken out of it
  | 'frozen' // this batch was made by putting part of another one in the freezer
  | 'thawed' // this batch was made by taking part of a frozen one out
  | 'confirmed' // you said you still have it
  | 'expiry' // its use-by was set by hand
  | 'assumed-eaten'; // snacks are taken as eaten after a few days

/** One line in a batch's history, oldest first. */
export interface HistoryEntry {
  date: string;
  kind: HistoryKind;
  /** The amount involved: what was used, thrown away or moved, or the amount counted. */
  quantity?: number;
  /** For `moved-out`: where it went. */
  to?: 'freezer' | 'thawed';
  /** For `expiry`: the date set. */
  useBy?: string;
  source?: StockEvent['source'];
  /** The event this comes from; absent for the purchase and for what is assumed. */
  eventId?: string;
  /** The event was kept out of the statistics (it still changed the stock). */
  untracked?: boolean;
  /** When the event was recorded (ISO timestamp), to order what happened on the same day and to show the time. */
  at?: string;
  /** The event's day was corrected by hand. */
  edited?: boolean;
  /** The event's day is only when it was logged: it happened at some unknown time before (see `StockEvent.undated`). */
  undated?: boolean;
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
  /** How much of `quantity` was taken out of the freezer and has not been used yet. */
  thawedQuantity: number;
  /** What happened to each batch, by batch id, oldest first: bought, used, put in the freezer… (also for batches that are gone). */
  history: Record<string, HistoryEntry[]>;
  /** Batches with nothing left (finished, thrown away, or assumed eaten): they stay for their history. */
  pastBatches: Batch[];
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
  thawed?: string;
  confirmed?: string;
  history: HistoryEntry[];
}

/** Soonest to expire first, otherwise oldest first. `key` is a batch's use-by, or its date when it has none. */
function byExpiry(key: (b: Work) => string) {
  return (a: Work, b: Work) => key(a).localeCompare(key(b)) || a.date.localeCompare(b.date);
}

/** Takes `amount` from the batches, the ones that expire first (or are oldest) first; never goes below zero. */
function consume(batches: Work[], amount: number, key: (b: Work) => string, took?: (b: Work, amount: number) => void): void {
  let left = amount;
  for (const b of batches.filter((x) => x.quantity > 1e-9).sort(byExpiry(key))) {
    if (left <= 1e-9) break;
    const take = round3(Math.min(b.quantity, left));
    b.quantity = round3(b.quantity - take);
    left -= take;
    took?.(b, take);
  }
}

/** Adds a line to a batch's history, taking the date, source and statistics flag from the event. */
function log(b: Work, e: StockEvent, entry: Omit<HistoryEntry, 'date' | 'source' | 'eventId' | 'untracked' | 'at' | 'undated'>): void {
  b.history.push({ date: e.date, ...entry, source: e.source, eventId: e.id, at: e.createdAt, ...(e.untracked ? { untracked: true } : {}), ...(e.undated ? { undated: true } : {}), ...(e.edited ? { edited: true } : {}) });
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
  events = effectiveEvents(events);
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
    if (b.thawed) return false; // thawed food is not made fresh again by counting it
    if (product.type === 'snack' && !b.frozen) return daysBetween(b.date, day) > SNACK_DAYS;
    const by = useByOf(b);
    return !!by && day > by;
  };

  const ops: Op[] = [];
  for (const p of purchases) {
    ops.push({ date: p.date, order: '', rank: 0, apply: (b) => b.push({ id: p.batch, date: p.date, quantity: p.quantity, history: [{ date: p.date, kind: 'bought', quantity: p.quantity }] }) });
  }
  for (const e of mine) {
    ops.push({
      date: e.date,
      order: e.createdAt,
      rank: e.type === 'count' && !e.batch ? 0 : 1,
      apply: (b) => {
        const target = e.batch ? b.find((x) => x.id === e.batch) : undefined;
        if (e.type === 'expiry') {
          if (target && e.useBy) {
            target.useBy = e.useBy;
            log(target, e, { kind: 'expiry', useBy: e.useBy });
          }
        } else if (e.type === 'freeze' || e.type === 'thaw') {
          // Moves some of a batch (or of whatever expires first) into a batch that is frozen, or back out of the freezer.
          const freezing = e.type === 'freeze';
          // Only fresh food goes in the freezer, and only frozen food comes out: food that was thawed is never frozen again.
          const eligible = (x: Work) => (freezing ? !x.frozen && !x.thawed : !!x.frozen);
          if (target && !eligible(target)) return;
          let left = e.quantity;
          const sources = target ? [target] : b.filter((x) => x.quantity > 1e-9 && eligible(x)).sort(byExpiry(keyOf));
          for (const src of sources) {
            if (left <= 1e-9) break;
            const take = round3(Math.min(src.quantity, left));
            src.quantity = round3(src.quantity - take);
            left -= take;
            log(src, e, { kind: 'moved-out', quantity: take, to: freezing ? 'freezer' : 'thawed' });
            const made: Work = { id: `${e.type}-${e.id}:${src.id ?? 'n'}`, date: src.date, quantity: take, history: [], ...(freezing ? { frozen: e.date } : { useBy: addDays(e.date, THAW_DAYS), thawed: e.date }) };
            log(made, e, { kind: freezing ? 'frozen' : 'thawed', quantity: take });
            b.push(made);
          }
        } else if (e.type === 'count') {
          if (e.batch) {
            if (target) {
              const before = target.quantity;
              target.quantity = round3(Math.max(0, e.quantity));
              if (target.quantity <= 1e-9 && before > 1e-9) log(target, e, { kind: 'finished', quantity: before });
              else log(target, e, { kind: e.source === 'check' && target.quantity > 1e-9 ? 'confirmed' : 'counted', quantity: target.quantity });
              // From the weekly check this is "yes, still have it": the batch counts as confirmed, and one that had gone past its date starts again.
              if (e.source === 'check' && target.quantity > 1e-9) {
                target.confirmed = e.date;
                if (stale(target, e.date)) Object.assign(target, { date: e.date, useBy: undefined });
              }
            }
            return;
          }
          const total = round3(b.reduce((s, x) => s + x.quantity, 0));
          if (e.quantity < total) consume(b, round3(total - e.quantity), keyOf, (x, taken) => log(x, e, { kind: 'adjusted', quantity: -taken }));
          else if (e.quantity > total) {
            const made: Work = { id: `count-${e.id}`, date: e.date, quantity: round3(e.quantity - total), history: [] };
            log(made, e, { kind: 'counted', quantity: made.quantity });
            b.push(made);
          }
          for (const x of b) {
            if (x.quantity <= 1e-9) continue;
            x.confirmed = e.date;
            log(x, e, { kind: 'confirmed', quantity: x.quantity });
            if (stale(x, e.date)) Object.assign(x, { date: e.date, useBy: undefined });
          }
        } else {
          const kind = e.type === 'toss' ? 'tossed' : 'used';
          if (target && target.quantity > 1e-9) {
            const take = round3(Math.min(target.quantity, e.quantity));
            target.quantity = round3(target.quantity - take);
            log(target, e, { kind, quantity: take });
          } else {
            consume(b, e.quantity, keyOf, (x, taken) => log(x, e, { kind, quantity: taken }));
          }
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

  // What is gone stays for its history; snacks that were assumed eaten get that said.
  const past: Batch[] = batches
    .filter((b) => b.id && !kept.includes(b))
    .map((b) => {
      if (b.quantity > 1e-9) b.history.push({ date: addDays(b.date, SNACK_DAYS), kind: 'assumed-eaten', quantity: b.quantity });
      return { date: b.date, quantity: 0, id: b.id, ...(b.frozen ? { frozen: b.frozen } : {}), ...(b.thawed ? { thawed: b.thawed } : {}) };
    });
  const history: Record<string, HistoryEntry[]> = {};
  for (const b of batches) if (b.id) history[b.id] = b.history;

  const out: Batch[] = kept.map((b) => {
    const useBy = useByOf(b);
    return { date: b.date, quantity: b.quantity, ...(b.id ? { id: b.id } : {}), ...(useBy ? { useBy } : {}), ...(b.frozen ? { frozen: b.frozen } : {}), ...(b.thawed ? { thawed: b.thawed } : {}), ...(b.confirmed ? { confirmed: b.confirmed } : {}) };
  });
  const frozenQuantity = round3(out.filter((b) => b.frozen).reduce((sum, b) => sum + b.quantity, 0));
  const thawedQuantity = round3(out.filter((b) => b.thawed).reduce((sum, b) => sum + b.quantity, 0));
  const useBy = out.map((b) => b.useBy).filter((d): d is string => !!d).sort()[0];

  let status: StockStatus = 'ok';
  if (quantity === 0) status = 'out';
  else if (useBy && today > useBy) status = 'check';
  else if (useBy && daysBetween(today, useBy) <= 1) status = 'use-soon';
  else if ((product.type === 'staple' || product.type === 'drink') && quantity <= 1) status = 'low';
  // Thawed food is to be used first, whatever else it is.
  if (thawedQuantity > 0 && (status === 'ok' || status === 'low')) status = 'use-soon';

  return { tracked: true, quantity, batches: out, useBy, frozenQuantity, thawedQuantity, history, pastBatches: past, lastConfirmed, status };
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
  return { tracked: false, frozenQuantity: 0, thawedQuantity: 0, history: {}, pastBatches: [], quantity: have ? 1 : 0, batches: have && lastConfirmed ? [{ date: lastConfirmed, quantity: 1 }] : [], lastConfirmed, status: have ? 'ok' : 'out' };
}

/** How many times a product was used on or after `since` (for products that are only "have it", where a use changes nothing else). */
export function usesSince(events: StockEvent[], since?: string): number {
  return effectiveEvents(events).filter((e) => e.type === 'use' && !e.undated && !e.untracked && (!since || e.date >= since)).length;
}

/**
 * Worth asking about in the weekly check: this batch is past its use-by date, or nothing has confirmed it for a while
 * (since it was bought, put in the freezer, or you last said you still had it). Thawed food is only asked about once past its date.
 */
export function needsBatchCheck(type: ProductType, b: Batch, today: string, storage?: Storage): boolean {
  if (b.quantity <= 0) return false;
  if (b.useBy && today > b.useBy) return true;
  if (b.thawed) return false;
  // What is in the freezer keeps for months: it is only worth a look now and then.
  const after = b.frozen ? FROZEN_CHECK_DAYS : storage === 'home' ? HOME_CHECK_DAYS : CHECK_AFTER_DAYS[type];
  return after !== undefined && daysBetween(b.confirmed ?? b.frozen ?? b.date, today) >= after;
}

/** The batches of a product the weekly check should ask about, in the order they are listed. */
export function batchesToCheck(type: ProductType, s: Stock, today: string, storage?: Storage): Batch[] {
  return s.tracked ? s.batches.filter((b) => needsBatchCheck(type, b, today, storage)) : [];
}

/** Worth asking about in the weekly check: at least one batch needs a look. Products you only have or don't are never asked about. */
export const needsCheck = (type: ProductType, s: Stock, today: string, storage?: Storage): boolean => batchesToCheck(type, s, today, storage).length > 0;

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
