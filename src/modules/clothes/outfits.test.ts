import { describe, expect, it } from 'vitest';
import { outfitName, outfitPieces, outfitsWithItem, unwearOutfit, wearOutfit } from './outfits';
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

  it('undoes a wear on the outfit and its pieces for that day only', () => {
    const o = { ...outfit, wears: ['2026-10-24', '2026-10-25'] };
    const r = unwearOutfit(o, [piece('a', ['2026-10-24', '2026-10-25']), piece('b')], '2026-10-25');
    expect(r.outfit?.wears).toEqual(['2026-10-24']);
    expect(r.pieces.map((p) => [p.id, p.wears])).toEqual([['a', ['2026-10-24']]]);
    expect(unwearOutfit(outfit, [], '2026-10-25').outfit).toBeNull();
  });

  it('falls back to the creation date for unnamed outfits', () => {
    expect(outfitName(outfit)).toMatch(/^Outfit from /);
    expect(outfitName({ ...outfit, name: 'Friday' })).toBe('Friday');
  });

  it('lists outfits containing an item, most recently worn first', () => {
    const o = (id: string, wears: string[], itemIds = ['a']): Outfit => ({ ...outfit, id, itemIds, wears });
    const list = [o('old', ['2026-01-01']), o('other', ['2026-12-01'], ['z']), o('new', ['2026-09-01']), o('never', [])];
    expect(outfitsWithItem('a', list).map((x) => x.id)).toEqual(['new', 'old', 'never']);
  });
});
