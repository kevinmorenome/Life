import { describe, expect, it } from 'vitest';
import { computeStats, costPerWear, lastWorn } from './stats';
import type { ClothingItem } from './types';

function item(over: Partial<ClothingItem>): ClothingItem {
  return {
    id: Math.random().toString(36),
    name: 'Item',
    category: 'tops',
    seasons: [],
    status: 'active',
    wears: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('clothes stats', () => {
  it('computes cost per wear only when price and wears exist', () => {
    expect(costPerWear(item({ price: 40, wears: ['2026-01-01', '2026-01-02'] }))).toBe(20);
    expect(costPerWear(item({ price: 40 }))).toBeNull();
    expect(costPerWear(item({ wears: ['2026-01-01'] }))).toBeNull();
  });

  it('finds the latest wear date regardless of order', () => {
    expect(lastWorn(item({ wears: ['2026-03-01', '2026-05-02', '2026-04-01'] }))).toBe('2026-05-02');
    expect(lastWorn(item({}))).toBeNull();
  });

  it('separates active items from ones that left the closet', () => {
    const s = computeStats(
      [
        item({ price: 100, category: 'shoes' }),
        item({ price: 50, category: 'tops' }),
        item({ price: 30, category: 'tops' }),
        item({ price: 80, status: 'donated' }),
      ],
      '2026-10-25',
    );
    expect(s.activeCount).toBe(3);
    expect(s.totalCount).toBe(4);
    expect(s.totalSpent).toBe(260);
    expect(s.activeValue).toBe(180);
    expect(s.byCategory).toEqual([
      { category: 'tops', count: 2 },
      { category: 'shoes', count: 1 },
    ]);
    expect(s.neverWorn).toHaveLength(3);
  });

  it('counts wears in the last 30 days', () => {
    const s = computeStats(
      [item({ wears: ['2026-10-25', '2026-09-26', '2026-09-25', '2026-01-01'] })],
      '2026-10-25',
    );
    expect(s.totalWears).toBe(4);
    expect(s.wearsLast30).toBe(2);
  });

  it('ranks best cost per wear ascending', () => {
    const cheap = item({ name: 'cheap', price: 10, wears: ['2026-01-01', '2026-01-02'] });
    const pricey = item({ name: 'pricey', price: 100, wears: ['2026-01-01'] });
    const s = computeStats([pricey, cheap], '2026-10-25');
    expect(s.bestCostPerWear.map((x) => x.item.name)).toEqual(['cheap', 'pricey']);
    expect(s.mostWorn[0].name).toBe('cheap');
  });
});
