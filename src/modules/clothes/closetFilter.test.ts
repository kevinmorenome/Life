import { describe, expect, it } from 'vitest';
import { activeFilterCount, categoryCounts, DEFAULT_FILTERS, filterItems, subcategoryCounts } from './closetFilter';
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

const tee = item({ name: 'Tee', subcategory: 'T-shirt', wears: ['2026-02-01'], createdAt: '2026-01-02T00:00:00Z' });
const jeans = item({ name: 'Jeans', category: 'bottoms', subcategory: 'Jeans', favorite: true, createdAt: '2026-01-03T00:00:00Z' });
const old = item({ name: 'Old shirt', subcategory: 'Shirt', status: 'donated' });
const all = [tee, jeans, old];

describe('closet filters', () => {
  it('hides non-active items by default and sorts newest first', () => {
    expect(filterItems(all, DEFAULT_FILTERS).map((i) => i.name)).toEqual(['Jeans', 'Tee']);
  });

  it('filters by category, sub-category, favorites and status', () => {
    expect(filterItems(all, { ...DEFAULT_FILTERS, category: 'bottoms' })).toEqual([jeans]);
    expect(filterItems(all, { ...DEFAULT_FILTERS, category: 'tops', subcategory: 'T-shirt' })).toEqual([tee]);
    expect(filterItems(all, { ...DEFAULT_FILTERS, favoritesOnly: true })).toEqual([jeans]);
    expect(filterItems(all, { ...DEFAULT_FILTERS, status: 'all' })).toHaveLength(3);
  });

  it('searches name and sub-category, ignoring case', () => {
    expect(filterItems(all, { ...DEFAULT_FILTERS, query: ' JEAN ' })).toEqual([jeans]);
  });

  it('sorts by most worn and longest unworn', () => {
    expect(filterItems(all, { ...DEFAULT_FILTERS, sort: 'most-worn' })[0]).toBe(tee);
    expect(filterItems(all, { ...DEFAULT_FILTERS, sort: 'least-recent' })[0]).toBe(jeans);
  });

  it('counts categories and sub-categories under the other filters', () => {
    expect(Object.fromEntries(categoryCounts(all, DEFAULT_FILTERS))).toEqual({ tops: 1, bottoms: 1 });
    expect(subcategoryCounts(all, { ...DEFAULT_FILTERS, category: 'all' }).size).toBe(0);
    expect(Object.fromEntries(subcategoryCounts(all, { ...DEFAULT_FILTERS, category: 'tops', status: 'all' }))).toEqual({
      Shirt: 1,
      'T-shirt': 1,
    });
  });

  it('counts only sheet filters that differ from the defaults', () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, query: 'x' })).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, category: 'tops', favoritesOnly: true, status: 'all' })).toBe(3);
  });
});
