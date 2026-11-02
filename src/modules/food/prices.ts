import { daysBetween } from './stock';
import { round2 } from './food';
import { packSizeOf, pricePerItem, type ProductSummary, type Purchase } from './products';

/** Prices older than this are not used to say another store is cheaper: shops change them. */
export const PRICE_FRESH_DAYS = 180;
/** A store has to be at least this much cheaper (a share of the price) before it is worth a flag. */
export const CHEAPER_BY = 0.05;

/** The price a purchase would have had without the discount (the shelf price). */
export function regularUnitPrice(p: Pick<Purchase, 'unitPrice' | 'discount' | 'quantity'>): number {
  const saved = p.discount && p.quantity > 0 ? p.discount / p.quantity : 0;
  return round2(p.unitPrice + saved);
}

/** True when the purchase was bought with a discount. */
export const wasOnOffer = (p: Pick<Purchase, 'discount'>): boolean => (p.discount ?? 0) > 0.004;

/** Prices are compared in one unit per product: per kg, per l, or per item (a can, not the 6-pack). */
export function comparablePrice(price: number, product: Pick<ProductSummary, 'unit' | 'packSize'>): number {
  return product.unit === 'pc' ? pricePerItem(price, packSizeOf(product, 'pc')) : round2(price);
}

/** " / kg", " / l", " / can" or " each": what a comparable price is per. */
export function priceUnit(product: Pick<ProductSummary, 'unit' | 'packSize' | 'packLabel'>): string {
  if (product.unit !== 'pc') return ` / ${product.unit}`;
  return product.packSize ? ` / ${product.packLabel || 'item'}` : ' each';
}

export interface StorePrice {
  store: string;
  /** Shelf price (without discount) at the last visit, comparable unit. */
  regular: number;
  /** What was actually paid at the last visit, comparable unit. */
  paid: number;
  /** The last visit had a discount. */
  onOffer: boolean;
  /** Lowest shelf price seen at this store. */
  lowestRegular: number;
  date: string;
  purchases: number;
}

/** The storekeepers' names compared loosely ("Konzum" and "KONZUM " are one store). */
const storeKey = (s: string) => s.trim().toLowerCase();

/** What a product cost at each store, best (cheapest shelf price) first. Purchases in another unit than the product's are skipped. */
export function storePrices(product: ProductSummary, today: string, maxAgeDays = PRICE_FRESH_DAYS): StorePrice[] {
  const byStore = new Map<string, Purchase[]>();
  for (const p of product.purchases) {
    if (p.unit !== product.unit) continue;
    const key = storeKey(p.store);
    byStore.set(key, [...(byStore.get(key) ?? []), p]);
  }
  const out: StorePrice[] = [];
  for (const list of byStore.values()) {
    const newest = list[0]; // purchases are newest first
    if (daysBetween(newest.date, today) > maxAgeDays) continue;
    out.push({
      store: newest.store.trim(),
      regular: comparablePrice(regularUnitPrice(newest), product),
      paid: comparablePrice(newest.unitPrice, product),
      onOffer: wasOnOffer(newest),
      lowestRegular: Math.min(...list.map((p) => comparablePrice(regularUnitPrice(p), product))),
      date: newest.date,
      purchases: list.length,
    });
  }
  return out.sort((a, b) => a.regular - b.regular || b.date.localeCompare(a.date));
}

export interface PriceComparison {
  prices: StorePrice[];
  /** Where you bought it last. */
  usual: StorePrice;
  /** The cheapest store, when it is not the one you bought at last by a clear margin. */
  cheaper?: StorePrice;
  /** What buying at the cheaper store saves per unit, and as a share. */
  saving?: number;
  savingPct?: number;
}

/**
 * Compares the shelf price at the store you bought at last with the other stores you have bought at. Shelf
 * prices (without discounts) are compared so a one-off offer doesn't hide the usual price.
 * Needs two stores with a recent price; otherwise there is nothing to compare.
 */
export function comparePrices(product: ProductSummary, today: string): PriceComparison | undefined {
  const prices = storePrices(product, today);
  if (prices.length === 0) return undefined;
  const last = product.purchases.find((p) => p.unit === product.unit);
  const usual = prices.find((p) => storeKey(p.store) === storeKey(last?.store ?? '')) ?? prices[0];
  const best = prices[0];
  if (prices.length < 2 || storeKey(best.store) === storeKey(usual.store)) return { prices, usual };
  const saving = round2(usual.regular - best.regular);
  const savingPct = usual.regular > 0 ? saving / usual.regular : 0;
  if (savingPct < CHEAPER_BY || saving < 0.01) return { prices, usual };
  return { prices, usual, cheaper: best, saving, savingPct };
}

export interface Saving {
  product: ProductSummary;
  comparison: PriceComparison;
  /** Saving per unit and, for what you actually bought in the last year, in total. */
  perUnit: number;
  yearly: number;
}

/** Products where another store you know has been cheaper, biggest yearly saving first. */
export function cheaperElsewhere(products: ProductSummary[], today: string): Saving[] {
  const out: Saving[] = [];
  for (const product of products) {
    const c = comparePrices(product, today);
    if (!c?.cheaper || c.saving === undefined) continue;
    // Quantity bought in the last 365 days, in the comparable unit.
    const items = product.purchases
      .filter((p) => p.unit === product.unit && daysBetween(p.date, today) <= 365)
      .reduce((s, p) => s + p.quantity * (product.unit === 'pc' ? (packSizeOf(product, 'pc') ?? 1) : 1), 0);
    out.push({ product, comparison: c, perUnit: c.saving, yearly: round2(items * c.saving) });
  }
  return out.sort((a, b) => b.yearly - a.yearly || b.comparison.savingPct! - a.comparison.savingPct!);
}

export interface HistoryPoint {
  date: string;
  store: string;
  /** Comparable unit price paid and the shelf price. */
  paid: number;
  regular: number;
  onOffer: boolean;
}

/** Every purchase as a point, oldest first, for a price history. */
export function priceHistory(product: ProductSummary): HistoryPoint[] {
  return product.purchases
    .filter((p) => p.unit === product.unit)
    .map((p) => ({ date: p.date, store: p.store, paid: comparablePrice(p.unitPrice, product), regular: comparablePrice(regularUnitPrice(p), product), onOffer: wasOnOffer(p) }))
    .reverse();
}

/** How much of the time you paid less than the shelf price, and what the offers saved on this product in all. */
export function offerShare(product: ProductSummary): { offers: number; of: number; saved: number } {
  const same = product.purchases.filter((p) => p.unit === product.unit);
  return { offers: same.filter(wasOnOffer).length, of: same.length, saved: round2(same.reduce((s, p) => s + (p.discount ?? 0), 0)) };
}
