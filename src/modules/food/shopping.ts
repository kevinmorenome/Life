import { round2 } from './food';
import { comparePrices, priceUnit, storePrices, type StorePrice } from './prices';
import { daysBetween } from './stock';
import type { Unit } from './types';
import type { Entry } from './stockEntries';

/** Why something is on the list. */
export type Reason = 'out' | 'low' | 'due';

export const REASON_LABELS: Record<Reason, string> = { out: 'Out', low: 'Running low', due: 'Time to rebuy' };

/** A product that was finished is only worth listing if it was bought lately or regularly. */
const OUT_RECENT_DAYS = 120;
/** Past this many cadences without a purchase the habit has lapsed and it is no longer "due". */
const LAPSED_CADENCES = 3;
const MIN_PURCHASE_DAYS = 3;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Days between buying it, typically: the median gap between distinct purchase days. Needs three different days. */
export function usualInterval(dates: string[]): number | undefined {
  const days = [...new Set(dates)].sort();
  if (days.length < MIN_PURCHASE_DAYS) return undefined;
  const gaps = days.slice(1).map((d, i) => daysBetween(days[i], d)).filter((g) => g > 0);
  return gaps.length ? Math.max(1, Math.round(median(gaps))) : undefined;
}

export interface ShoppingItem {
  productId: string;
  name: string;
  reason: Reason;
  /** What you usually buy in one go, in the product's unit (pieces or packs, kg or l). */
  quantity: number;
  unit: Unit;
  /** Rebuy rhythm in days, when known. */
  everyDays?: number;
  daysSince: number;
  /** The cheapest store you know of for it, and its price. */
  store?: string;
  price?: StorePrice;
  /** What the usual quantity costs at that store, when there is a price. */
  cost?: number;
  /** Text after the price: " / kg", " each"… */
  per: string;
  /** What shopping at the cheapest store instead of where you usually go saves per unit. */
  saving?: number;
}

/** What you usually take per purchase: the middle of the quantities bought, rounded to a sensible step. */
export function usualQuantity(quantities: number[], unit: Unit): number {
  if (quantities.length === 0) return 1;
  const m = median(quantities);
  return unit === 'pc' ? Math.max(1, Math.round(m)) : Math.max(0.1, Math.round(m * 10) / 10);
}

/**
 * Builds the list from what is out or low, and from what you usually rebuy by now. Snacks are assumed eaten
 * after a few days so they are only listed by rhythm, and anything bought just once and long ago is left off.
 */
export function shoppingList(entries: Entry[], today: string): ShoppingItem[] {
  const items: ShoppingItem[] = [];
  for (const { product, stock } of entries) {
    if (product.purchases.length === 0) continue;
    const last = product.purchases[0].date;
    const daysSince = daysBetween(last, today);
    const everyDays = usualInterval(product.purchases.map((p) => p.date));
    const rebuying = product.purchases.length >= 2;

    // Something bought once, long ago, is more likely forgotten than missing; a habit stays relevant for longer.
    const current = daysSince <= (rebuying ? OUT_RECENT_DAYS * 3 : OUT_RECENT_DAYS);
    let reason: Reason | undefined;
    if (product.type !== 'snack' && stock.status === 'out' && current) reason = 'out';
    else if (stock.status === 'low' && current) reason = 'low';
    else if (everyDays && daysSince >= everyDays && daysSince <= everyDays * LAPSED_CADENCES && stock.status !== 'use-soon') reason = 'due';
    if (!reason) continue;
    // Fresh food that is not out yet is not "due": the stock tracking knows better.
    if (reason === 'due' && product.type === 'fresh' && stock.quantity > 0) continue;

    const prices = storePrices(product, today);
    const best = prices[0];
    const cmp = comparePrices(product, today);
    const quantity = usualQuantity(product.purchases.filter((p) => p.unit === product.unit).map((p) => p.quantity), product.unit);
    items.push({
      productId: product.id,
      name: product.name,
      reason,
      quantity,
      unit: product.unit,
      everyDays,
      daysSince,
      store: best?.store,
      price: best,
      cost: best ? round2(best.regular * quantity * (product.unit === 'pc' ? (product.packSize ?? 1) : 1)) : undefined,
      per: priceUnit(product),
      saving: cmp?.cheaper ? cmp.saving : undefined,
    });
  }
  const order: Record<Reason, number> = { out: 0, low: 1, due: 2 };
  return items.sort((a, b) => order[a.reason] - order[b.reason] || a.name.localeCompare(b.name));
}

export interface StoreGroup {
  /** Undefined for things with no known price. */
  store?: string;
  items: ShoppingItem[];
  /** What the items cost at this store at the usual quantities (items without a price are left out). */
  estimate: number;
}

/** Items grouped by their cheapest store, the store with the most items first and "Anywhere" last. */
export function groupByStore(items: ShoppingItem[]): StoreGroup[] {
  const groups = new Map<string, StoreGroup>();
  for (const item of items) {
    const key = item.store?.trim().toLowerCase() ?? '';
    const g = groups.get(key) ?? { store: item.store, items: [], estimate: 0 };
    g.items.push(item);
    g.estimate = round2(g.estimate + (item.cost ?? 0));
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (a.store ? 0 : 1) - (b.store ? 0 : 1) || b.items.length - a.items.length || (a.store ?? '').localeCompare(b.store ?? ''));
}
