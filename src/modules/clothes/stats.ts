import type { Category, ClothingItem } from './types';

export interface ClothesStats {
  activeCount: number;
  totalCount: number;
  totalSpent: number;
  activeValue: number;
  totalWears: number;
  wearsLast30: number;
  byCategory: { category: Category; count: number }[];
  mostWorn: ClothingItem[];
  neverWorn: ClothingItem[];
  bestCostPerWear: { item: ClothingItem; cpw: number }[];
}

/** Total times worn, including undated wears from before tracking. */
export function wearCount(item: { wears: string[]; priorWears?: number }): number {
  return item.wears.length + (item.priorWears ?? 0);
}

export function costPerWear(item: ClothingItem): number | null {
  const n = wearCount(item);
  if (item.price == null || n === 0) return null;
  return item.price / n;
}

export function lastWorn(item: { wears: string[] }): string | null {
  return item.wears.length ? item.wears.reduce((a, b) => (a > b ? a : b)) : null;
}

/** Whole days since the item was bought (or added, if there's no purchase date). */
export function daysInCloset(item: Pick<ClothingItem, 'purchaseDate' | 'createdAt'>, today: string): number {
  const start = item.purchaseDate ?? item.createdAt.slice(0, 10);
  const ms = Date.parse(today + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z');
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** `today` is YYYY-MM-DD; passed in so the function stays pure for tests. */
export function computeStats(items: ClothingItem[], today: string): ClothesStats {
  const active = items.filter((i) => i.status === 'active');
  const cutoff = shiftDate(today, -30);

  const counts = new Map<Category, number>();
  for (const i of active) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);

  return {
    activeCount: active.length,
    totalCount: items.length,
    totalSpent: sum(items.map((i) => i.price ?? 0)),
    activeValue: sum(active.map((i) => i.price ?? 0)),
    totalWears: sum(items.map(wearCount)),
    wearsLast30: sum(items.map((i) => i.wears.filter((d) => d > cutoff && d <= today).length)),
    byCategory: [...counts]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    mostWorn: active
      .filter((i) => wearCount(i) > 0)
      .sort((a, b) => wearCount(b) - wearCount(a))
      .slice(0, 5),
    neverWorn: active.filter((i) => wearCount(i) === 0),
    bestCostPerWear: active
      .map((item) => ({ item, cpw: costPerWear(item) }))
      .filter((x): x is { item: ClothingItem; cpw: number } => x.cpw != null)
      .sort((a, b) => a.cpw - b.cpw)
      .slice(0, 5),
  };
}

function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
