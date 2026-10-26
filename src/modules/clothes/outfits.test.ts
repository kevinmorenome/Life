import { describe, expect, it } from 'vitest';
import { outfitFromItems, outfitName, outfitPieces, outfitsWithItem, syncPieceWears, unwearOutfit, wearOutfit } from './outfits';
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
  it('builds an outfit worn on the day from already-logged pieces', () => {
    const o = outfitFromItems([piece('a', ['2026-10-25']), piece('b', ['2026-10-25'])], '2026-10-25', 'now');
    expect(o.itemIds).toEqual(['a', 'b']);
    expect(o.wears).toEqual(['2026-10-25']);
    expect(o.createdAt).toBe('now');
  });

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

  it('moves logged wears to the new pieces when a worn outfit is edited', () => {
    const before: Outfit = { ...outfit, itemIds: ['a', 'b'], wears: ['2026-10-26'] };
    const after: Outfit = { ...before, itemIds: ['a', 'c'] };
    const items = [piece('a', ['2026-10-26']), piece('b', ['2026-10-26', '2026-10-01']), piece('c')];
    const changed = syncPieceWears(before, after, items, []);
    expect(changed.map((p) => [p.id, p.wears])).toEqual([
      ['b', ['2026-10-01']],
      ['c', ['2026-10-26']],
    ]);
  });

  it('keeps a removed piece\'s wear when another outfit worn that day includes it', () => {
    const before: Outfit = { ...outfit, itemIds: ['a', 'b'], wears: ['2026-10-26'] };
    const after: Outfit = { ...before, itemIds: ['a'] };
    const other: Outfit = { ...outfit, id: 'p', itemIds: ['b'], wears: ['2026-10-26'] };
    expect(syncPieceWears(before, after, [piece('b', ['2026-10-26'])], [other])).toEqual([]);
  });
});
