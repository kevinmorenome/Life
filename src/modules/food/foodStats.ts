import { round2 } from './food';
import { comparablePrice, priceUnit } from './prices';
import { averageUnitPrice, defaultType, isStocked, productId, type ProductSummary } from './products';
import { addDays, daysBetween } from './stock';
import { usualInterval } from './shopping';
import type { FoodProduct, FoodReceipt, LineKind, ProductType, StockEvent } from './types';

/** Lines that count as food spending: deposits and bags stay out. */
export const isFoodSpend = (kind: LineKind): boolean => kind !== 'deposit' && kind !== 'bag';

const monthOf = (date: string) => date.slice(0, 7);

/** The Monday of the week a date is in (weeks start on Monday). */
export function weekStart(date: string): string {
  const dow = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7; // Monday = 0
  return addDays(date, -dow);
}

export interface Period {
  /** YYYY-MM for months, the Monday's date for weeks. */
  key: string;
  spent: number;
  trips: number;
}

function addMonths(ym: string, n: number): string {
  const d = new Date(`${ym}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

/** Food spend per month for the last `count` months ending at `nowMonth`, months without shopping included as zero. */
export function monthlyFoodSpend(receipts: FoodReceipt[], nowMonth: string, count = 12): Period[] {
  const by = new Map<string, Period>();
  for (const r of receipts) {
    const spent = r.lines.filter((l) => isFoodSpend(l.kind)).reduce((s, l) => s + l.paid, 0);
    const m = by.get(monthOf(r.date)) ?? { key: monthOf(r.date), spent: 0, trips: 0 };
    m.spent = round2(m.spent + spent);
    m.trips += 1;
    by.set(m.key, m);
  }
  return Array.from({ length: count }, (_, i) => addMonths(nowMonth, i - count + 1)).map((key) => by.get(key) ?? { key, spent: 0, trips: 0 });
}

/** Food spend per week (Monday-start) for the last `count` weeks up to the week of `today`. */
export function weeklyFoodSpend(receipts: FoodReceipt[], today: string, count = 12): Period[] {
  const by = new Map<string, Period>();
  for (const r of receipts) {
    const key = weekStart(r.date);
    const spent = r.lines.filter((l) => isFoodSpend(l.kind)).reduce((s, l) => s + l.paid, 0);
    const w = by.get(key) ?? { key, spent: 0, trips: 0 };
    w.spent = round2(w.spent + spent);
    w.trips += 1;
    by.set(key, w);
  }
  const thisWeek = weekStart(today);
  return Array.from({ length: count }, (_, i) => addDays(thisWeek, (i - count + 1) * 7)).map((key) => by.get(key) ?? { key, spent: 0, trips: 0 });
}

export interface StoreSpend {
  store: string;
  spent: number;
  trips: number;
  /** Average receipt (food spend only). */
  average: number;
}

/** Spend per store, most spent first. Stores are matched ignoring case and spaces. */
export function spendByStore(receipts: FoodReceipt[]): StoreSpend[] {
  const by = new Map<string, StoreSpend>();
  for (const r of receipts) {
    const key = r.store.trim().toLowerCase();
    const spent = r.lines.filter((l) => isFoodSpend(l.kind)).reduce((s, l) => s + l.paid, 0);
    const e = by.get(key) ?? { store: r.store.trim(), spent: 0, trips: 0, average: 0 };
    e.spent = round2(e.spent + spent);
    e.trips += 1;
    by.set(key, e);
  }
  return [...by.values()].map((e) => ({ ...e, average: e.trips ? round2(e.spent / e.trips) : 0 })).sort((a, b) => b.spent - a.spent);
}

export interface CategorySpend {
  key: string;
  label: string;
  spent: number;
}

const TYPE_LABELS: Record<ProductType, string> = { fresh: 'Fresh food', staple: 'Staples', drink: 'Drinks', snack: 'Snacks' };

/** Spend by what the product is (fresh, staple, drink, snack); alcohol is its own category and other lines are "Other". */
export function spendByCategory(receipts: FoodReceipt[], records: FoodProduct[]): CategorySpend[] {
  const types = new Map(records.map((r) => [r.id, r.type]));
  const by = new Map<string, CategorySpend>();
  const add = (key: string, label: string, amount: number) => {
    const e = by.get(key) ?? { key, label, spent: 0 };
    e.spent = round2(e.spent + amount);
    by.set(key, e);
  };
  for (const r of receipts) {
    for (const l of r.lines) {
      if (!isFoodSpend(l.kind)) continue;
      if (l.kind === 'alcohol') add('alcohol', 'Alcohol', l.paid);
      else if (!isStocked(l.kind)) add('other', 'Other', l.paid);
      else {
        const type = types.get(productId(l.name)) ?? defaultType(l.kind, l.unit);
        add(type, TYPE_LABELS[type], l.paid);
      }
    }
  }
  return [...by.values()].sort((a, b) => b.spent - a.spent);
}

export interface SavedSummary {
  saved: number;
  /** Lines bought with a discount, of all stocked lines. */
  offerLines: number;
  lines: number;
}

/** What discounts saved in a set of receipts (they are inside the prices, so this is extra information, not a subtraction). */
export function savedByOffers(receipts: FoodReceipt[]): SavedSummary {
  let saved = 0;
  let offerLines = 0;
  let lines = 0;
  for (const r of receipts) {
    for (const l of r.lines) {
      if (!isFoodSpend(l.kind)) continue;
      lines += 1;
      if (l.discount > 0.004) {
        offerLines += 1;
        saved += l.discount;
      }
    }
  }
  return { saved: round2(saved), offerLines, lines };
}

export interface DepositSummary {
  /** Deposit fees charged on top of prices. */
  paid: number;
  lines: number;
}

/** Deposit fees (POV.NAKNADA) charged as their own lines. Deposits included in product prices are not separate lines, so are not here. */
export function depositSummary(receipts: FoodReceipt[]): DepositSummary {
  let paid = 0;
  let lines = 0;
  for (const r of receipts) {
    for (const l of r.lines) {
      if (l.kind !== 'deposit') continue;
      paid += l.paid;
      lines += 1;
    }
  }
  return { paid: round2(paid), lines };
}

export interface ShoppingHabits {
  trips: number;
  /** Average food spend per trip. */
  basket: number;
  /** Trips per week over the span from the first to the last receipt (at least one week). */
  perWeek: number;
  since?: string;
}

export function shoppingHabits(receipts: FoodReceipt[]): ShoppingHabits {
  if (receipts.length === 0) return { trips: 0, basket: 0, perWeek: 0 };
  const dates = receipts.map((r) => r.date).sort();
  const spent = receipts.reduce((s, r) => s + r.lines.filter((l) => isFoodSpend(l.kind)).reduce((a, l) => a + l.paid, 0), 0);
  const span = Math.max(7, daysBetween(dates[0], dates[dates.length - 1]) + 1);
  return { trips: receipts.length, basket: round2(spent / receipts.length), perWeek: Math.round((receipts.length / (span / 7)) * 10) / 10, since: dates[0] };
}

export interface Wasted {
  productId: string;
  name: string;
  /** Number of times it was thrown away, and how much (in the product's unit). */
  times: number;
  quantity: number;
  /** What the thrown-away food cost, valued at its average price per unit. */
  value: number;
}

export interface WasteSummary {
  /** What was thrown away, in euros at average prices. */
  value: number;
  times: number;
  /** Share of everything spent on stocked food (0–1); undefined with no spending. */
  share?: number;
  perMonth: { key: string; value: number }[];
  top: Wasted[];
}

/**
 * Food thrown away (`toss` events), valued at what the product usually costs per unit. For a product counted in
 * items (a 6-pack of cans) the price is per item. Products you only have-or-don't are valued at one pack per toss.
 */
export function wasteSummary(products: ProductSummary[], events: StockEvent[], receipts: FoodReceipt[], nowMonth: string, months = 12): WasteSummary {
  const byId = new Map(products.map((p) => [p.id, p]));
  const per = new Map<string, Wasted>();
  const monthly = new Map<string, number>();
  let value = 0;
  let times = 0;
  for (const e of events) {
    if (e.type !== 'toss' || e.quantity <= 0) continue;
    const p = byId.get(e.productId);
    if (!p) continue;
    // A pack-less product is thrown by pack; for multipacks the quantity is in items and the price per item.
    const unitCost = p.trackAmount ? comparablePrice(averageUnitPrice(p), p) : averageUnitPrice(p);
    const quantity = p.trackAmount ? e.quantity : 1;
    const worth = round2(unitCost * quantity);
    value = round2(value + worth);
    times += 1;
    monthly.set(monthOf(e.date), round2((monthly.get(monthOf(e.date)) ?? 0) + worth));
    const w = per.get(p.id) ?? { productId: p.id, name: p.name, times: 0, quantity: 0, value: 0 };
    w.times += 1;
    w.quantity = Math.round((w.quantity + e.quantity) * 1000) / 1000;
    w.value = round2(w.value + worth);
    per.set(p.id, w);
  }
  const spent = receipts.reduce((s, r) => s + r.lines.filter((l) => isStocked(l.kind)).reduce((a, l) => a + l.paid, 0), 0);
  const perMonth = Array.from({ length: months }, (_, i) => addMonths(nowMonth, i - months + 1)).map((key) => ({ key, value: monthly.get(key) ?? 0 }));
  return { value, times, share: spent > 0 ? value / spent : undefined, perMonth, top: [...per.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, 10) };
}

export interface Rebuy {
  productId: string;
  name: string;
  purchases: number;
  /** Usual days between purchases. */
  everyDays?: number;
  spent: number;
  per: string;
}

/** The products you buy most often, with how often and what they added up to. */
export function rebuyStats(products: ProductSummary[], limit = 10): Rebuy[] {
  return products
    .filter((p) => p.purchases.length >= 2)
    .map((p) => ({
      productId: p.id,
      name: p.name,
      purchases: p.purchases.length,
      everyDays: usualInterval(p.purchases.map((x) => x.date)),
      spent: round2(p.purchases.reduce((s, x) => s + x.paid, 0)),
      per: priceUnit(p),
    }))
    .sort((a, b) => b.purchases - a.purchases || b.spent - a.spent)
    .slice(0, limit);
}
