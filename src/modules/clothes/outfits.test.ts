import { describe, expect, it } from 'vitest';
import { outfitName, outfitPieces, wearOutfit } from './outfits';
import type { ClothingItem, Outfit } from './types';

const piece = (id: string, wears: string[] = []): ClothingItem => ({
  id,
  name: id,
  category: 'tops',
  seasons: [],
  status: 'active',
  wears,
  createdAt: 'x',
  updatedAt: 'x',
});
const outfit: Outfit = { id: 'o', itemIds: ['a', 'b', 'gone'], wears: [], createdAt: '2026-07-20T07:53:54Z', updatedAt: 'x' };

describe('outfits', () => {
  it('resolves pieces in order and skips deleted ones', () => {
    expect(outfitPieces(outfit, [piece('b'), piece('a')]).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('logs a wear on the outfit and each piece, without double-counting a day', () => {
    const { outfit: o, pieces } = wearOutfit(outfit, [piece('a'), piece('b', ['2026-10-25'])], '2026-10-25');
    expect(o?.wears).toEqual(['2026-10-25']);
    expect(pieces.map((p) => p.id)).toEqual(['a']);
    expect(wearOutfit({ ...outfit, wears: ['2026-10-25'] }, [], '2026-10-25').outfit).toBeNull();
  });

  it('falls back to the creation date for unnamed outfits', () => {
    expect(outfitName(outfit)).toMatch(/^Outfit from /);
    expect(outfitName({ ...outfit, name: 'Friday' })).toBe('Friday');
  });
});
