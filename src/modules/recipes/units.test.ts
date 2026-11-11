import { describe, expect, it } from 'vitest';
import { convert, stockToBase, toBase, unitFamily } from './units';

describe('unitFamily', () => {
  it('groups units by what they measure', () => {
    expect(unitFamily('kg')).toBe('weight');
    expect(unitFamily('oz')).toBe('weight');
    expect(unitFamily('cup')).toBe('volume');
    expect(unitFamily('tsp')).toBe('volume');
    expect(unitFamily('piece')).toBe('count');
    expect(unitFamily('pinch')).toBe('none');
    expect(unitFamily('to taste')).toBe('none');
  });
});

describe('toBase', () => {
  it('converts to grams and millilitres', () => {
    expect(toBase(0.5, 'kg')).toEqual({ family: 'weight', amount: 500 });
    expect(toBase(1, 'l')).toEqual({ family: 'volume', amount: 1000 });
    expect(toBase(1, 'cup')!.amount).toBeCloseTo(236.59, 2);
    expect(toBase(3, 'tsp')!.amount).toBeCloseTo(toBase(1, 'tbsp')!.amount, 6);
    expect(toBase(2, 'piece')).toEqual({ family: 'count', amount: 2 });
  });

  it('has nothing for unmeasurable amounts', () => {
    expect(toBase(1, 'pinch')).toBeNull();
    expect(toBase(undefined, 'g')).toBeNull();
    expect(toBase(-1, 'g')).toBeNull();
    expect(toBase(Number.NaN, 'g')).toBeNull();
  });
});

describe('stockToBase', () => {
  it('reads the food module units', () => {
    expect(stockToBase(0.5, 'kg')).toEqual({ family: 'weight', amount: 500 });
    expect(stockToBase(1.5, 'l')).toEqual({ family: 'volume', amount: 1500 });
    expect(stockToBase(3, 'pc')).toEqual({ family: 'count', amount: 3 });
  });
});

describe('convert', () => {
  it('converts within a family', () => {
    expect(convert(200, 'g', 'kg')).toBeCloseTo(0.2);
    expect(convert(16, 'oz', 'g')).toBeCloseTo(453.59, 2);
    expect(convert(1, 'cup', 'tbsp')).toBeCloseTo(16, 6);
  });

  it('refuses across families', () => {
    expect(convert(1, 'cup', 'g')).toBeNull();
    expect(convert(1, 'piece', 'g')).toBeNull();
    expect(convert(1, 'pinch', 'g')).toBeNull();
  });
});
