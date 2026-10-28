import { itemColors } from './colors';
import { isRetired } from './lifecycle';
import { daysInCloset, wearCount } from './stats';
import type { Category, ClothingItem } from './types';

// All functions are pure; `today` is YYYY-MM-DD and passed in for tests.

const DAY_MS = 86_400_000;

function dayNumber(iso: string): number {
  return Math.round(Date.parse(iso + 'T00:00:00Z') / DAY_MS);
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export interface SpendBucket {
  /** `YYYY-MM` or `YYYY`. */
  key: string;
  spent: number;
  count: number;
}

export interface SpendTrend {
  buckets: SpendBucket[];
  total: number;
  /** Spend on items with a price but no purchase date; not in any bucket. */
  undated: number;
}

/** Spend per month (the last 12) or per year (from the first purchase), by purchase date. */
export function spendTrend(items: ClothingItem[], by: 'month' | 'year', today: string): SpendTrend {
  const len = by === 'month' ? 7 : 4;
  const spent = new Map<string, { spent: number; count: number }>();
  let undated = 0;
  for (const i of items) {
    if (i.price == null) continue;
    if (!i.purchaseDate) {
      undated += i.price;
      continue;
    }
    const key = i.purchaseDate.slice(0, len);
    const cur = spent.get(key) ?? { spent: 0, count: 0 };
    spent.set(key, { spent: cur.spent + i.price, count: cur.count + 1 });
  }

  const keys: string[] = [];
  if (by === 'month') {
    const end = today.slice(0, 7);
    for (let n = 11; n >= 0; n--) keys.push(shiftMonth(end, -n));
  } else {
    const end = Number(today.slice(0, 4));
    const first = Math.min(end, ...[...spent.keys()].map(Number));
    for (let y = first; y <= end; y++) keys.push(String(y));
  }
  const buckets = keys.map((key) => ({ key, spent: spent.get(key)?.spent ?? 0, count: spent.get(key)?.count ?? 0 }));
  return { buckets, total: buckets.reduce((a, b) => a + b.spent, 0), undated };
}

export interface CategoryValue {
  category: Category;
  value: number;
  count: number;
}

/** What the active closet is worth by category (sum of purchase prices), biggest first. */
export function valueByCategory(items: ClothingItem[]): CategoryValue[] {
  const by = new Map<Category, CategoryValue>();
  for (const i of items) {
    if (i.status !== 'active' || i.price == null) continue;
    const cur = by.get(i.category) ?? { category: i.category, value: 0, count: 0 };
    cur.value += i.price;
    cur.count += 1;
    by.set(i.category, cur);
  }
  return [...by.values()].sort((a, b) => b.value - a.value);
}

export interface Usage {
  active: number;
  worn: number;
  /** 0–100, whole percent. */
  pct: number;
}

/** Share of active items worn in the last `days` days (`null` = at any time, incl. undated wears). */
export function closetUsage(items: ClothingItem[], days: number | null, today: string): Usage {
  const active = items.filter((i) => i.status === 'active');
  const from = days == null ? null : dayNumber(today) - days;
  const worn = active.filter((i) =>
    from == null ? wearCount(i) > 0 : i.wears.some((d) => dayNumber(d) > from && d <= today),
  ).length;
  return { active: active.length, worn, pct: active.length ? Math.round((worn / active.length) * 100) : 0 };
}

export interface ColorSlice {
  name: string;
  count: number;
}

/** Colours across the active closet (an item counts once per colour), top `max` plus "Other". */
export function colorBreakdown(items: ClothingItem[], max = 7): ColorSlice[] {
  const counts = new Map<string, ColorSlice>();
  for (const i of items) {
    if (i.status !== 'active') continue;
    for (const name of new Set(itemColors(i).map((c) => c.trim()).filter(Boolean))) {
      const key = name.toLowerCase();
      const cur = counts.get(key) ?? { name: name[0].toUpperCase() + name.slice(1), count: 0 };
      cur.count += 1;
      counts.set(key, cur);
    }
  }
  const sorted = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (sorted.length <= max) return sorted;
  const rest = sorted.slice(max - 1);
  return [...sorted.slice(0, max - 1), { name: 'Other', count: rest.reduce((a, b) => a + b.count, 0) }];
}

/**
 * Active items ordered by times worn, optionally within one category. Least-used breaks ties by the
 * time spent in the closet, so long-forgotten pieces come first.
 */
export function usageRanking(
  items: ClothingItem[],
  category: Category | 'all',
  order: 'most' | 'least',
  today: string,
  limit = 5,
): ClothingItem[] {
  const pool = items.filter((i) => i.status === 'active' && (category === 'all' || i.category === category));
  const sorted =
    order === 'most'
      ? pool.filter((i) => wearCount(i) > 0).sort((a, b) => wearCount(b) - wearCount(a))
      : pool.sort((a, b) => wearCount(a) - wearCount(b) || daysInCloset(b, today) - daysInCloset(a, today));
  return sorted.slice(0, limit);
}

export interface Pair {
  a: ClothingItem;
  b: ClothingItem;
  days: number;
}

/** Pairs of items worn on the same day most often, among those seen together on at least `min` days. */
export function wornTogether(items: ClothingItem[], limit = 5, min = 2): Pair[] {
  const byDate = new Map<string, ClothingItem[]>();
  for (const i of items) for (const d of new Set(i.wears)) byDate.set(d, [...(byDate.get(d) ?? []), i]);

  const pairs = new Map<string, Pair>();
  for (const group of byDate.values()) {
    if (group.length < 2 || group.length > 12) continue; // a huge "day" is a bulk log, not an outfit
    for (let x = 0; x < group.length; x++) {
      for (let y = x + 1; y < group.length; y++) {
        const [a, b] = group[x].id < group[y].id ? [group[x], group[y]] : [group[y], group[x]];
        const key = `${a.id}|${b.id}`;
        const cur = pairs.get(key);
        if (cur) cur.days += 1;
        else pairs.set(key, { a, b, days: 1 });
      }
    }
  }
  return [...pairs.values()]
    .filter((p) => p.days >= min)
    .sort((p, q) => q.days - p.days || p.a.name.localeCompare(q.a.name))
    .slice(0, limit);
}

export interface BrandStat {
  brand: string;
  items: number;
  wears: number;
  spent: number;
}

/** Brands ranked by total wears, case-insensitively merged; items without a brand are skipped. */
export function brandRanking(items: ClothingItem[], limit = 6): BrandStat[] {
  const by = new Map<string, BrandStat>();
  for (const i of items) {
    const brand = i.brand?.trim();
    if (!brand) continue;
    const cur = by.get(brand.toLowerCase()) ?? { brand, items: 0, wears: 0, spent: 0 };
    cur.items += 1;
    cur.wears += wearCount(i);
    cur.spent += i.price ?? 0;
    by.set(brand.toLowerCase(), cur);
  }
  return [...by.values()].sort((a, b) => b.wears - a.wears || b.items - a.items || a.brand.localeCompare(b.brand)).slice(0, limit);
}

export interface Keep {
  item: ClothingItem;
  days: number;
  /** Still in the closet (or storage), so `days` is how long it has been kept so far. */
  ongoing: boolean;
}

export interface Longevity {
  /** Longest-kept items first. */
  longest: Keep[];
  /** Average days kept by items that have left the closet with both dates known; `null` if none. */
  avgRetiredDays: number | null;
  retiredCount: number;
  /** Items missing a purchase date, so left out. */
  unknown: number;
}

/** How long items are kept: purchase date to retirement, or to today while they're still around. */
export function longevity(items: ClothingItem[], today: string, limit = 5): Longevity {
  const keeps: Keep[] = [];
  const retiredDays: number[] = [];
  let unknown = 0;
  for (const item of items) {
    if (!item.purchaseDate) {
      unknown += 1;
      continue;
    }
    if (isRetired(item)) {
      if (!item.retiredDate) continue;
      const days = Math.max(0, dayNumber(item.retiredDate) - dayNumber(item.purchaseDate));
      retiredDays.push(days);
      keeps.push({ item, days, ongoing: false });
    } else {
      keeps.push({ item, days: Math.max(0, dayNumber(today) - dayNumber(item.purchaseDate)), ongoing: true });
    }
  }
  return {
    longest: keeps.sort((a, b) => b.days - a.days).slice(0, limit),
    avgRetiredDays: retiredDays.length ? Math.round(retiredDays.reduce((a, b) => a + b, 0) / retiredDays.length) : null,
    retiredCount: retiredDays.length,
    unknown,
  };
}

/** "3 yr 2 mo", "5 mo", "12 d" — a short span for a number of days. */
export function formatSpan(days: number): string {
  if (days < 30) return `${days} d`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} yr ${rest} mo` : `${years} yr`;
}
