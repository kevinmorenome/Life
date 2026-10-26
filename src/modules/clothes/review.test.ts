import { describe, expect, it } from 'vitest';
import { isReviewed, markReviewed, stepItems, stepProgress, stepValues, toggleStepValue, toggleSubcategory } from './review';
import type { ClothingItem } from './types';

const item = (over: Partial<ClothingItem> = {}): ClothingItem => ({
  id: 'a',
  name: 'Tee',
  category: 'tops',
  seasons: [],
  status: 'active',
  wears: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('toggleStepValue', () => {
  it('toggles seasons, keeping canonical order', () => {
    let i = toggleStepValue(item({ seasons: ['winter'] }), 'season', 'Spring');
    expect(i.seasons).toEqual(['spring', 'winter']);
    i = toggleStepValue(i, 'season', 'Winter');
    expect(i.seasons).toEqual(['spring']);
  });

  it('toggles occasions case-insensitively without touching other fields', () => {
    const i = toggleStepValue(item({ occasions: ['work'], tags: ['x'] }), 'occasion', 'Work');
    expect(i.occasions).toBeUndefined();
    expect(i.tags).toEqual(['x']);
    expect(toggleStepValue(i, 'occasion', 'Daily').occasions).toEqual(['Daily']);
  });

  it('changing category drops the sub-category, re-picking it keeps it', () => {
    const t = item({ subcategory: 'T-shirt' });
    expect(toggleStepValue(t, 'category', 'Tops').subcategory).toBe('T-shirt');
    const b = toggleStepValue(t, 'category', 'Bottoms');
    expect(b.category).toBe('bottoms');
    expect(b.subcategory).toBeUndefined();
  });

  it('keeps colors and the legacy color string in step', () => {
    const i = toggleStepValue(item({ color: 'Red' }), 'color', 'Blue');
    expect(i.colors).toEqual(['Red', 'Blue']);
    expect(i.color).toBe('Red, Blue');
  });

  it('single-choice steps replace, and clear on re-pick', () => {
    let i = toggleStepValue(item(), 'pattern', 'Striped');
    expect(i.pattern).toBe('Striped');
    i = toggleStepValue(i, 'pattern', 'Solid');
    expect(i.pattern).toBe('Solid');
    expect(toggleStepValue(i, 'pattern', 'Solid').pattern).toBeUndefined();
    expect(toggleStepValue(item({ fit: 'Slim' }), 'fit', 'Relaxed').fit).toBe('Relaxed');
  });

  it('edits the comma-joined material text', () => {
    let i = toggleStepValue(item({ material: 'Cotton, Elastane' }), 'material', 'Linen');
    expect(i.material).toBe('Cotton, Elastane, Linen');
    i = toggleStepValue(i, 'material', 'cotton');
    expect(i.material).toBe('Elastane, Linen');
    expect(stepValues(i, 'material')).toEqual(['Elastane', 'Linen']);
  });
});

it('toggleSubcategory sets and clears', () => {
  const i = toggleSubcategory(item(), 'Shirt');
  expect(i.subcategory).toBe('Shirt');
  expect(toggleSubcategory(i, 'shirt').subcategory).toBeUndefined();
});

describe('progress', () => {
  const items = [
    item({ id: '1', reviewed: { season: '2026-10-20' } }),
    item({ id: '2', reviewed: { season: '2026-10-25' } }),
    item({ id: '3' }),
    item({ id: '4', status: 'sold' }),
  ];

  it('counts pending among active items and finds the latest date', () => {
    expect(stepProgress(items, 'season')).toEqual({ lastReviewed: '2026-10-25', pending: 1, total: 3 });
    expect(stepProgress(items, 'fit')).toEqual({ lastReviewed: undefined, pending: 3, total: 3 });
  });

  it('stepItems filters by category and only-new', () => {
    expect(stepItems(items, 'season', 'all', true).map((i) => i.id)).toEqual(['3']);
    expect(stepItems(items, 'season', 'all', false)).toHaveLength(3);
    expect(stepItems(items, 'season', 'bottoms', false)).toHaveLength(0);
  });

  it('markReviewed stamps one step only', () => {
    const m = markReviewed(items[2], 'season', '2026-10-26');
    expect(isReviewed(m, 'season')).toBe(true);
    expect(isReviewed(m, 'fit')).toBe(false);
  });
});
