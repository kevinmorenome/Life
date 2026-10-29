import { describe, expect, it } from 'vitest';
import {
  brandRanking,
  closetUsage,
  colorBreakdown,
  dormantItems,
  formatSpan,
  longevity,
  priceBands,
  repeatRate,
  seasonBalance,
  spendTrend,
  spendVsWear,
  usageRanking,
  valueByCategory,
  wearStreaks,
  wornTogether,
} from './insights';
import { retiredDateFor, withStatus } from './lifecycle';
import type { ClothingItem } from './types';

let n = 0;
function item(over: Partial<ClothingItem>): ClothingItem {
  n += 1;
  return {
    id: `i${n}`,
    name: `Item ${n}`,
    category: 'tops',
    seasons: [],
    status: 'active',
    wears: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const TODAY = '2026-06-15';

describe('lifecycle', () => {
  it('stamps retiredDate on leaving, keeps it between retired statuses, clears it on return', () => {
    const sold = withStatus(item({}), 'sold', '2026-03-01');
    expect(sold.retiredDate).toBe('2026-03-01');
    expect(withStatus(sold, 'donated', '2026-04-01').retiredDate).toBe('2026-03-01');
    expect(withStatus(sold, 'active', '2026-04-01').retiredDate).toBeUndefined();
    expect(withStatus(item({}), 'storage', '2026-03-01').retiredDate).toBeUndefined();
    expect(retiredDateFor(undefined, 'discarded', '2026-03-01')).toBe('2026-03-01');
  });
});

describe('spendTrend', () => {
  const items = [
    item({ price: 50, purchaseDate: '2026-06-02' }),
    item({ price: 30, purchaseDate: '2026-06-20' }),
    item({ price: 10, purchaseDate: '2025-07-01' }),
    item({ price: 99, purchaseDate: '2020-01-01' }),
    item({ price: 5 }),
    item({}),
  ];
  it('buckets the last 12 months by purchase date', () => {
    const t = spendTrend(items, 'month', TODAY);
    expect(t.buckets).toHaveLength(12);
    expect(t.buckets[0].key).toBe('2025-07');
    expect(t.buckets[11]).toEqual({ key: '2026-06', spent: 80, count: 2 });
    expect(t.buckets[0].spent).toBe(10);
    expect(t.total).toBe(90);
    expect(t.undated).toBe(5);
  });
  it('buckets by year from the first purchase', () => {
    const t = spendTrend(items, 'year', TODAY);
    expect(t.buckets.map((b) => b.key)).toEqual(['2020', '2021', '2022', '2023', '2024', '2025', '2026']);
    expect(t.buckets[0].spent).toBe(99);
    expect(t.buckets[6].spent).toBe(80);
  });
});

describe('valueByCategory', () => {
  it('sums active priced items per category, biggest first', () => {
    const v = valueByCategory([
      item({ category: 'shoes', price: 100 }),
      item({ category: 'tops', price: 20 }),
      item({ category: 'tops', price: 30 }),
      item({ category: 'tops', price: 500, status: 'sold' }),
      item({ category: 'bags' }),
    ]);
    expect(v).toEqual([
      { category: 'shoes', value: 100, count: 1 },
      { category: 'tops', value: 50, count: 2 },
    ]);
  });
});

describe('closetUsage', () => {
  const items = [
    item({ wears: ['2026-06-10'] }),
    item({ wears: ['2026-01-10'] }),
    item({ priorWears: 3 }),
    item({}),
    item({ wears: ['2026-06-14'], status: 'sold' }),
  ];
  it('counts active items worn in the window', () => {
    expect(closetUsage(items, 30, TODAY)).toEqual({ active: 4, worn: 1, pct: 25 });
    expect(closetUsage(items, 365, TODAY)).toEqual({ active: 4, worn: 2, pct: 50 });
  });
  it('counts undated wears only for "ever"', () => {
    expect(closetUsage(items, null, TODAY)).toEqual({ active: 4, worn: 3, pct: 75 });
  });
  it('handles an empty closet', () => {
    expect(closetUsage([], 30, TODAY).pct).toBe(0);
  });
});

describe('colorBreakdown', () => {
  it('counts per colour, merging case, skipping retired items', () => {
    const b = colorBreakdown([
      item({ colors: ['Black'] }),
      item({ colors: ['black', 'White'] }),
      item({ color: 'Blue, White' }),
      item({ colors: ['Red'], status: 'donated' }),
      item({}),
    ]);
    expect(b).toEqual([
      { name: 'Black', count: 2 },
      { name: 'White', count: 2 },
      { name: 'Blue', count: 1 },
    ]);
  });
  it('folds the tail into Other', () => {
    const colors = ['a', 'b', 'c', 'd', 'e'].map((c) => item({ colors: [c] }));
    const b = colorBreakdown([...colors, colors[0]], 3);
    expect(b).toHaveLength(3);
    expect(b[2]).toEqual({ name: 'Other', count: 3 });
  });
});

describe('usageRanking', () => {
  const a = item({ name: 'A', wears: ['2026-01-01', '2026-01-02', '2026-01-03'] });
  const b = item({ name: 'B', priorWears: 1 });
  const c = item({ name: 'C', category: 'shoes', createdAt: '2025-01-01T00:00:00Z' });
  const d = item({ name: 'D', createdAt: '2026-05-01T00:00:00Z' });
  const retired = item({ name: 'R', status: 'sold', wears: ['2026-01-01'] });
  const all = [a, b, c, d, retired];
  it('ranks most worn, ignoring unworn and retired', () => {
    expect(usageRanking(all, 'all', 'most', TODAY).map((i) => i.name)).toEqual(['A', 'B']);
  });
  it('ranks least worn with the longest-owned first among ties, and filters by category', () => {
    expect(usageRanking(all, 'all', 'least', TODAY).map((i) => i.name)).toEqual(['C', 'D', 'B', 'A']);
    expect(usageRanking(all, 'tops', 'least', TODAY).map((i) => i.name)).toEqual(['D', 'B', 'A']);
  });
});

describe('wornTogether', () => {
  const a = item({ name: 'A', wears: ['2026-01-01', '2026-01-05', '2026-01-09'] });
  const b = item({ name: 'B', wears: ['2026-01-01', '2026-01-05'] });
  const c = item({ name: 'C', wears: ['2026-01-01', '2026-01-09', '2026-01-09'] });
  it('counts days a pair was worn together, hiding one-offs', () => {
    const p = wornTogether([a, b, c]);
    expect(p.map((x) => [x.a.name, x.b.name, x.days].join())).toEqual(['A,B,2', 'A,C,2']);
  });
  it('can include one-offs', () => {
    expect(wornTogether([a, b, c], 10, 1)).toHaveLength(3);
  });
  it('ignores bulk-logged days', () => {
    const many = Array.from({ length: 13 }, () => item({ wears: ['2026-02-01', '2026-02-02'] }));
    expect(wornTogether(many)).toEqual([]);
  });
});

describe('brandRanking', () => {
  it('merges brand casing and ranks by wears', () => {
    const r = brandRanking([
      item({ brand: 'Zara', wears: ['2026-01-01'] }),
      item({ brand: 'zara ', priorWears: 4, price: 20 }),
      item({ brand: 'Uniqlo', wears: ['2026-01-01', '2026-01-02'] }),
      item({}),
    ]);
    expect(r).toEqual([
      { brand: 'Zara', items: 2, wears: 5, spent: 20 },
      { brand: 'Uniqlo', items: 1, wears: 2, spent: 0 },
    ]);
  });
});

describe('longevity', () => {
  const old = item({ name: 'Old', purchaseDate: '2020-06-15' });
  const gone = item({ name: 'Gone', purchaseDate: '2024-06-15', status: 'sold', retiredDate: '2025-06-15' });
  const goneNoDate = item({ name: 'NoDate', purchaseDate: '2024-06-15', status: 'sold' });
  const undated = item({ name: 'U' });
  it('measures kept time and ignores what it cannot date', () => {
    const l = longevity([old, gone, goneNoDate, undated], TODAY);
    expect(l.longest.map((k) => [k.item.name, k.ongoing])).toEqual([['Old', true], ['Gone', false]]);
    expect(l.avgRetiredDays).toBe(365);
    expect(l.retiredCount).toBe(1);
    expect(l.unknown).toBe(1);
  });
  it('has no average without retired items', () => {
    expect(longevity([old], TODAY).avgRetiredDays).toBeNull();
  });
});

describe('formatSpan', () => {
  it('picks a readable unit', () => {
    expect(formatSpan(12)).toBe('12 d');
    expect(formatSpan(150)).toBe('5 mo');
    expect(formatSpan(365)).toBe('1 yr');
    expect(formatSpan(365 * 3 + 60)).toBe('3 yr 2 mo');
  });
});

describe('dormantItems', () => {
  const a = item({ name: 'A', wears: ['2026-01-01', '2026-02-01'] });
  const b = item({ name: 'B', wears: ['2026-06-10'] });
  const c = item({ name: 'C', priorWears: 5 });
  const d = item({ name: 'D', wears: ['2025-01-01'], status: 'sold' });
  it('lists active items idle for at least N days, longest idle first', () => {
    const r = dormantItems([a, b, c, d], 90, TODAY);
    expect(r.map((x) => [x.item.name, x.since])).toEqual([['A', 134]]);
    expect(dormantItems([a, b], 3, TODAY).map((x) => x.item.name)).toEqual(['A', 'B']);
  });
});

describe('wearStreaks', () => {
  // 2026-06-15 is a Monday.
  const items = [
    item({ wears: ['2026-06-15', '2026-06-14', '2026-06-13', '2026-06-01'] }),
    item({ wears: ['2026-06-14', '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05'] }),
    item({ priorWears: 9 }),
  ];
  it('counts the current and longest runs', () => {
    const s = wearStreaks(items, TODAY);
    expect(s.current).toBe(3);
    expect(s.longest).toBe(5);
  });
  it('keeps the streak alive when today is not logged yet', () => {
    expect(wearStreaks([item({ wears: ['2026-06-14', '2026-06-13'] })], TODAY).current).toBe(2);
    expect(wearStreaks([item({ wears: ['2026-06-12'] })], TODAY).current).toBe(0);
  });
  it('counts days logged this year', () => {
    const s = wearStreaks(items, TODAY);
    expect(s.daysThisYear).toBe(9);
    expect(s.daysElapsed).toBe(166);
  });
  it('builds Monday-first weeks ending in the current one', () => {
    const s = wearStreaks(items, TODAY, 3);
    expect(s.weeks).toHaveLength(3);
    expect(s.weeks[2][0]).toEqual({ date: '2026-06-15', on: true, future: false });
    expect(s.weeks[2][1].future).toBe(true);
    expect(s.weeks[1][6].date).toBe('2026-06-14');
    expect(s.weeks[0][0].date).toBe('2026-06-01');
    expect(s.weeks[0][0].on).toBe(true);
  });
});

describe('seasonBalance', () => {
  it('counts active items per season and those with none', () => {
    const r = seasonBalance([
      item({ seasons: ['summer', 'spring'] }),
      item({ seasons: ['summer'] }),
      item({}),
      item({ seasons: ['winter'], status: 'sold' }),
    ]);
    expect(r.seasons).toEqual([
      { season: 'spring', count: 1 },
      { season: 'summer', count: 2 },
      { season: 'fall', count: 0 },
      { season: 'winter', count: 0 },
    ]);
    expect(r.unset).toBe(1);
  });
});

describe('spendVsWear', () => {
  it('compares each category’s share of spend and wears', () => {
    const r = spendVsWear([
      item({ category: 'shoes', price: 150, wears: ['2026-01-01'] }),
      item({ category: 'tops', price: 50, priorWears: 3, status: 'sold' }),
      item({ category: 'bags' }),
    ]);
    expect(r).toEqual([
      { category: 'shoes', spent: 150, wears: 1, spendShare: 0.75, wearShare: 0.25 },
      { category: 'tops', spent: 50, wears: 3, spendShare: 0.25, wearShare: 0.75 },
    ]);
  });
  it('is empty without data', () => {
    expect(spendVsWear([])).toEqual([]);
  });
});

describe('priceBands', () => {
  it('buckets active priced items and finds the median', () => {
    const r = priceBands([
      item({ price: 10 }),
      item({ price: 25 }),
      item({ price: 49.99 }),
      item({ price: 100 }),
      item({ price: 250 }),
      item({}),
      item({ price: 5, status: 'sold' }),
    ]);
    expect(r.bands.map((b) => b.count)).toEqual([1, 2, 0, 1, 1]);
    expect(r.median).toBe(49.99);
    expect(r.unpriced).toBe(1);
  });
  it('has no median without prices', () => {
    expect(priceBands([item({})]).median).toBeNull();
  });
});

describe('repeatRate', () => {
  it('measures the gap between wears of the same item', () => {
    const r = repeatRate([
      item({ wears: ['2026-01-01', '2026-01-03', '2026-01-10', '2026-03-01'] }), // gaps 2, 7, 50
      item({ wears: ['2026-01-01', '2026-01-02', '2026-01-02'] }), // gap 1 (duplicate day ignored)
    ]);
    expect(r.total).toBe(4);
    expect(r.buckets.map((b) => b.count)).toEqual([2, 1, 0, 0, 1]);
    expect(r.medianGap).toBe(5);
  });
  it('has no median without re-wears', () => {
    expect(repeatRate([item({ wears: ['2026-01-01'] })]).medianGap).toBeNull();
  });
});
