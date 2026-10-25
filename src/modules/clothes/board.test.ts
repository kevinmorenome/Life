import { describe, expect, it } from 'vitest';
import { boardLayout } from './board';
import type { Category, ClothingItem } from './types';

const p = (id: string, category: Category): ClothingItem => ({
  id,
  name: id,
  category,
  seasons: [],
  status: 'active',
  wears: [],
  createdAt: 'x',
  updatedAt: 'x',
});

describe('boardLayout', () => {
  it('places pieces from head to feet, outerwear first', () => {
    const b = boardLayout([p('tee', 'tops'), p('jeans', 'bottoms'), p('jacket', 'outerwear'), p('shoes', 'shoes'), p('cap', 'accessories')]);
    expect(b.upper.map((x) => x.id)).toEqual(['jacket', 'tee']);
    expect(b.lower.map((x) => x.id)).toEqual(['jeans']);
    expect(b.feet.map((x) => x.id)).toEqual(['shoes']);
    expect(b.extra.map((x) => x.id)).toEqual(['cap']);
    expect(b.hidden).toBe(0);
  });

  it('caps each zone and counts the rest', () => {
    const tops = Array.from({ length: 5 }, (_, i) => p(`t${i}`, 'tops'));
    const b = boardLayout([...tops, p('b1', 'bottoms'), p('b2', 'bottoms'), p('b3', 'bottoms')]);
    expect(b.upper).toHaveLength(3);
    expect(b.lower).toHaveLength(2);
    expect(b.hidden).toBe(3);
  });

  it('places ambiguous categories by name, and fills an empty bottom row', () => {
    const pj = { ...p('pj', 'sleepwear'), name: 'Black pyjama bottoms' };
    expect(boardLayout([p('tee', 'tops'), pj]).lower.map((x) => x.id)).toEqual(['pj']);
    const sport = { ...p('sport', 'activewear'), name: 'Sportswear' };
    const b = boardLayout([p('tee', 'tops'), sport, p('cap', 'accessories')]);
    expect(b.lower.map((x) => x.id)).toEqual(['sport']);
    expect(b.extra.map((x) => x.id)).toEqual(['cap']);
  });
});
