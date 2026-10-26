import { describe, expect, it } from 'vitest';
import { withField } from './fields';
import type { ClothingItem } from './types';

const item: ClothingItem = {
  id: 'a', name: 'Tee', category: 'tops', seasons: [], status: 'active', wears: ['2020-01-01'],
  tags: ['x'], priorWears: 3, brand: 'Zara', price: 10, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
};

describe('withField', () => {
  it('keeps other fields and bumps updatedAt', () => {
    const n = withField(item, 'brand', ' Uniqlo ')!;
    expect(n.brand).toBe('Uniqlo');
    expect(n.wears).toEqual(['2020-01-01']);
    expect(n.tags).toEqual(['x']);
    expect(n.priorWears).toBe(3);
    expect(n.updatedAt > item.updatedAt).toBe(true);
  });
  it('clears optional fields when blank', () => {
    expect(withField(item, 'brand', '  ')!.brand).toBeUndefined();
    expect(withField(item, 'price', '')!.price).toBeUndefined();
  });
  it('rejects a blank name', () => {
    expect(withField(item, 'name', ' ')).toBeNull();
  });
  it('parses prices, accepting a decimal comma', () => {
    expect(withField(item, 'price', '12,50')!.price).toBe(12.5);
    expect(withField(item, 'price', 'abc')).toBeNull();
    expect(withField(item, 'price', '-1')).toBeNull();
  });
  it('validates select options', () => {
    expect(withField(item, 'category', 'shoes')!.category).toBe('shoes');
    expect(withField(item, 'category', 'nope')).toBeNull();
    expect(withField(item, 'status', 'sold')!.status).toBe('sold');
    expect(withField(item, 'condition', '')!.condition).toBeUndefined();
    expect(withField(item, 'condition', 'new')!.condition).toBe('new');
  });
});
