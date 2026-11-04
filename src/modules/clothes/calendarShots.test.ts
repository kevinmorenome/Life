import { describe, expect, it } from 'vitest';
import { collagePieces, dayShots } from './calendarShots';
import type { ClothingItem, Outfit } from './types';

const piece = (id: string, category: ClothingItem['category'], photo?: string) => ({ id, category, photo }) as ClothingItem;

describe('collagePieces', () => {
  it('puts the main garments first and stops at four', () => {
    const out = collagePieces([piece('a', 'accessories', 'x'), piece('s', 'shoes', 'x'), piece('b', 'bottoms', 'x'), piece('t', 'tops', 'x'), piece('o', 'outerwear', 'x')]);
    expect(out.map((p) => p.id)).toEqual(['t', 'o', 'b', 's']);
  });
  it('leaves out pieces without a photo while enough have one', () => {
    expect(collagePieces([piece('t', 'tops', 'x'), piece('b', 'bottoms')]).map((p) => p.id)).toEqual(['t', 'b']);
    expect(collagePieces([piece('t', 'tops', 'x'), piece('b', 'bottoms', 'x'), piece('s', 'shoes')], 2).map((p) => p.id)).toEqual(['t', 'b']);
  });
});

describe('dayShots', () => {
  const o = { id: 'o1', name: 'Smart', itemIds: ['t'] } as Outfit;
  const items = [piece('t', 'tops', 'x')];
  it('shows worn outfits and loose pieces, else what is planned', () => {
    const shots = dayShots({ outfits: [o], items: [{ ...piece('z', 'shoes'), name: 'Boots' }, piece('y', 'shoes')] }, [o], items);
    expect(shots.map((s) => s.name)).toEqual(['Smart', 'Boots +1']);
    expect(dayShots(undefined, [o], items)).toMatchObject([{ name: 'Smart', planned: true }]);
    expect(dayShots(undefined, undefined, items)).toEqual([]);
  });
});
