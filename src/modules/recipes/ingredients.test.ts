import { describe, expect, it } from 'vitest';
import { badQuantities, formatQuantity, fromDrafts, ingredientAmount, parseQuantity, scaleIngredients, toDraft, type IngredientDraft } from './ingredients';
import type { RecipeIngredient } from './types';

describe('parseQuantity', () => {
  it('reads what people type', () => {
    expect(parseQuantity('200')).toBe(200);
    expect(parseQuantity(' 0,5 ')).toBe(0.5);
    expect(parseQuantity('1/2')).toBe(0.5);
    expect(parseQuantity('1 1/2')).toBe(1.5);
    expect(parseQuantity('½')).toBe(0.5);
    expect(parseQuantity('1½')).toBe(1.5);
    expect(parseQuantity('2 ¼')).toBe(2.25);
  });
  it('has nothing for an empty field and NaN for nonsense', () => {
    expect(parseQuantity('')).toBeUndefined();
    expect(parseQuantity('  ')).toBeUndefined();
    expect(parseQuantity('abc')).toBeNaN();
    expect(parseQuantity('0')).toBeNaN();
    expect(parseQuantity('-2')).toBeNaN();
    expect(parseQuantity('1/0')).toBeNaN();
    expect(parseQuantity('1/2½')).toBeNaN();
  });
});

describe('formatQuantity', () => {
  it('rounds grams and millilitres to what a scale shows', () => {
    expect(formatQuantity(333.333, 'g')).toBe('333');
    expect(formatQuantity(7.25, 'ml')).toBe('7.3');
    expect(formatQuantity(0.75, 'kg')).toBe('0.75');
  });
  it('uses kitchen fractions for spoons, cups and pieces', () => {
    expect(formatQuantity(1.5, 'cup')).toBe('1½');
    expect(formatQuantity(0.5, 'tsp')).toBe('½');
    expect(formatQuantity(1 / 3, 'tbsp')).toBe('⅓');
    expect(formatQuantity(3, 'piece')).toBe('3');
    expect(formatQuantity(2.999, 'piece')).toBe('3');
    expect(formatQuantity(1.4, 'oz')).toBe('1.4');
  });
});

describe('ingredientAmount', () => {
  it('says the amount with its unit', () => {
    expect(ingredientAmount({ quantity: 200, unit: 'g' })).toBe('200 g');
    expect(ingredientAmount({ quantity: 2, unit: 'piece' })).toBe('2');
    expect(ingredientAmount({ unit: 'piece' })).toBe('');
    expect(ingredientAmount({ unit: 'to taste' })).toBe('to taste');
    expect(ingredientAmount({ unit: 'pinch' })).toBe('a pinch');
    expect(ingredientAmount({ quantity: 2, unit: 'pinch' })).toBe('2 pinches');
    expect(ingredientAmount({ quantity: 1.5, unit: 'fl oz' })).toBe('1½ fl oz');
  });
});

describe('scaleIngredients', () => {
  const list: RecipeIngredient[] = [
    { id: 'a', name: 'Tortellini', quantity: 250, unit: 'g' },
    { id: 'b', name: 'Pesto', quantity: 0.5, unit: 'cup' },
    { id: 'c', name: 'Salt', quantity: 1, unit: 'pinch' },
    { id: 'd', name: 'Pepper', unit: 'to taste' },
    { id: 'e', name: 'Lemon', unit: 'piece' },
  ];
  it('multiplies measured amounts', () => {
    const scaled = scaleIngredients(list, 2, 4);
    expect(scaled.map((i) => i.quantity)).toEqual([500, 1, 1, undefined, undefined]);
  });
  it('never changes the stored list', () => {
    scaleIngredients(list, 2, 3);
    expect(list[0].quantity).toBe(250);
    expect(scaleIngredients(list, 2, 2)).toBe(list);
    expect(scaleIngredients(list, 0, 2)).toBe(list);
  });
});

describe('drafts', () => {
  const draft = (over: Partial<IngredientDraft>): IngredientDraft => ({ id: 'x', name: 'Basil', quantity: '', unit: 'g', optional: false, notes: '', ...over });

  it('round-trips an ingredient and keeps what the form does not show', () => {
    const ing: RecipeIngredient = { id: 'i1', name: 'Pesto', quantity: 12.5, unit: 'g', optional: true, notes: 'fresh', productId: 'fp-pesto', substitutions: [{ id: 's', useName: 'Basil oil' }] };
    expect(toDraft(ing).quantity).toBe('12.5');
    expect(fromDrafts([toDraft(ing)])).toEqual([ing]);
  });

  it('drops unnamed rows, cleans names and leaves no amount on "to taste"', () => {
    const out = fromDrafts([draft({ id: 'a', name: '  ' }), draft({ id: 'b', name: ' Black   pepper ', quantity: '1', unit: 'to taste' }), draft({ id: 'c', name: 'Eggs', quantity: '2', unit: 'piece' })]);
    expect(out).toEqual([
      { id: 'b', name: 'Black pepper', unit: 'to taste' },
      { id: 'c', name: 'Eggs', quantity: 2, unit: 'piece' },
    ]);
  });

  it('clears optional and notes when they are unset', () => {
    const base: RecipeIngredient = { id: 'i', name: 'Nuts', unit: 'g', quantity: 30, optional: true, notes: 'toasted' };
    expect(fromDrafts([{ ...toDraft(base), optional: false, notes: '' }])).toEqual([{ id: 'i', name: 'Nuts', unit: 'g', quantity: 30 }]);
  });

  it('flags amounts it cannot read, only on named rows', () => {
    expect(badQuantities([draft({ id: 'a', quantity: 'lots' }), draft({ id: 'b', name: '', quantity: 'lots' }), draft({ id: 'c', quantity: '2' })])).toEqual(['a']);
  });
});
