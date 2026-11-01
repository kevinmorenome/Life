import { round2 } from './food';
import type { FoodProduct, FoodReceipt, LineKind, ProductType, Storage, Unit } from './types';

/** Lowercase, no accents, words separated by single spaces: the form names are compared in. */
export function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A product's id from its cleaned name: "Oat drink 3.5%" → "fp-oat-drink-3-5". */
export function productId(name: string): string {
  return `fp-${normalizeKey(name).replace(/ /g, '-') || 'item'}`;
}

/** Lines of these kinds are things you stock; deposits and bags are not. */
export const isStocked = (kind: LineKind): boolean => kind === 'food' || kind === 'alcohol';

export function defaultType(kind: LineKind, unit: Unit): ProductType {
  if (kind === 'alcohol') return 'drink';
  return unit === 'kg' ? 'fresh' : 'staple';
}

export function defaultStorage(type: ProductType): Storage {
  return type === 'fresh' ? 'fridge' : 'pantry';
}

/**
 * The name an earlier receipt gave to the same printed text at the same store, so "NAP ZOB 3,5% MA NO M" is
 * always the same product however Claude words it this time. Falls back to the name as given.
 */
export function canonicalName(store: string, rawName: string | undefined, name: string, receipts: Pick<FoodReceipt, 'store' | 'date' | 'lines'>[]): string {
  const raw = rawName ? normalizeKey(rawName) : '';
  if (!raw) return name;
  const s = normalizeKey(store);
  const known = [...receipts]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((r) => (normalizeKey(r.store) === s ? r.lines : []))
    .find((l) => l.rawName && normalizeKey(l.rawName) === raw);
  return known?.name ?? name;
}

export interface Purchase {
  receiptId: string;
  date: string;
  time?: string;
  store: string;
  quantity: number;
  unit: Unit;
  unitPrice: number;
  paid: number;
}

export interface ProductSummary {
  id: string;
  name: string;
  kind: LineKind;
  unit: Unit;
  type: ProductType;
  storage: Storage;
  shelfLifeDays?: number;
  /** True when someone set the type/storage (there is a product record), false when they are defaults. */
  custom: boolean;
  /** Newest first. */
  purchases: Purchase[];
}

/** Every stocked product that appears on a receipt, with its purchases (newest first) and what is known about it. */
export function productSummaries(receipts: FoodReceipt[], products: FoodProduct[]): ProductSummary[] {
  const records = new Map(products.map((p) => [p.id, p]));
  const byId = new Map<string, ProductSummary>();
  // The name, unit and kind shown are the newest purchase's.
  const newest = new Map<string, string>();
  for (const r of receipts) {
    for (const l of r.lines) {
      if (!isStocked(l.kind)) continue;
      const id = productId(l.name);
      const rec = records.get(id);
      const purchase: Purchase = { receiptId: r.id, date: r.date, time: r.time, store: r.store, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, paid: l.paid };
      let p = byId.get(id);
      if (!p) {
        const type = rec?.type ?? defaultType(l.kind, l.unit);
        p = { id, name: l.name, kind: l.kind, unit: l.unit, type, storage: rec?.storage ?? defaultStorage(type), shelfLifeDays: rec?.shelfLifeDays, custom: !!rec, purchases: [] };
        byId.set(id, p);
        newest.set(id, r.date);
      }
      p.purchases.push(purchase);
      if (r.date > newest.get(id)!) {
        newest.set(id, r.date);
        p.name = l.name;
        p.unit = l.unit;
        p.kind = l.kind;
      }
    }
  }
  const out = [...byId.values()];
  for (const p of out) p.purchases.sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''));
  return out.sort((a, b) => b.purchases[0].date.localeCompare(a.purchases[0].date) || a.name.localeCompare(b.name));
}

/** " / kg", " / l" or " each", to follow a price. */
export const perUnit = (unit: Unit): string => (unit === 'pc' ? ' each' : ` / ${unit}`);

/** What a product cost per unit, averaged over its purchases (weighted by quantity). */
export function averageUnitPrice(p: Pick<ProductSummary, 'purchases'>): number {
  const qty = p.purchases.reduce((s, x) => s + x.quantity, 0);
  return qty ? round2(p.purchases.reduce((s, x) => s + x.paid, 0) / qty) : 0;
}
