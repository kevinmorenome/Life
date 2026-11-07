import { describe, expect, it } from 'vitest';
import { collagePieces } from './collage';
import type { ClothingItem } from './types';

const piece = (id: string, category: ClothingItem['category'], photo?: string) => ({ id, category, photo }) as ClothingItem;

describe('collagePieces', () => {
  it('puts the main garments first and stops at four', () => {
    const all = [piece('a', 'accessories', 'x'), piece('s', 'shoes', 'x'), piece('b', 'bottoms', 'x'), piece('t', 'tops', 'x'), piece('o', 'outerwear', 'x')];
    expect(collagePieces(all).map((p) => p.id)).toEqual(['t', 'o', 'b', 's']);
  });
  it('skips pieces without a photo while enough have one', () => {
    expect(collagePieces([piece('t', 'tops', 'x'), piece('b', 'bottoms', 'x'), piece('s', 'shoes')], 2).map((p) => p.id)).toEqual(['t', 'b']);
    expect(collagePieces([piece('t', 'tops', 'x'), piece('b', 'bottoms')]).map((p) => p.id)).toEqual(['t', 'b']);
  });
});
