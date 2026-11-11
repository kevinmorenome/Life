import { describe, expect, it } from 'vitest';
import { amountText, badAmounts, formatQuantity, fromDrafts, ingredientAmount, parseAmount, parseQuantity, scaleIngredients, toDraft, type IngredientDraft } from './ingredients';
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

describe('parseAmount', () => {
  it('reads a number and a unit together', () => {
    expect(parseAmount('250 g')).toEqual({ quantity: 250, unit: 'g' });
    expect(parseAmount('250g')).toEqual({ quantity: 250, unit: 'g' });
    expect(parseAmount('0,5 kg')).toEqual({ quantity: 0.5, unit: 'kg' });
    expect(parseAmount('1/2 cup')).toEqual({ quantity: 0.5, unit: 'cup' });
    expect(parseAmount('1 1/2 cups')).toEqual({ quantity: 1.5, unit: 'cup' });
    expect(parseAmount('1½ Tablespoons')).toEqual({ quantity: 1.5, unit: 'tbsp' });
    expect(parseAmount('2 fl oz')).toEqual({ quantity: 2, unit: 'fl oz' });
    expect(parseAmount('3 oz')).toEqual({ quantity: 3, unit: 'oz' });
    expect(parseAmount('1 T')).toEqual({ quantity: 1, unit: 'tbsp' });
    expect(parseAmount('1 t')).toEqual({ quantity: 1, unit: 'tsp' });
    expect(parseAmount('1 tsp.')).toEqual({ quantity: 1, unit: 'tsp' });
  });
  it('takes a bare number as pieces, and words for the rest', () => {
    expect(parseAmount('2')).toEqual({ quantity: 2, unit: 'piece' });
    expect(parseAmount('')).toEqual({ unit: 'piece' });
    expect(parseAmount('To taste')).toEqual({ unit: 'to taste' });
    expect(parseAmount('a pinch')).toEqual({ quantity: 1, unit: 'pinch' });
    expect(parseAmount('2 pinches')).toEqual({ quantity: 2, unit: 'pinch' });
  });
  it('refuses what it cannot read', () => {
    expect(parseAmount('lots')).toBeNull();
    expect(parseAmount('2 handfuls')).toBeNull();
    expect(parseAmount('0 g')).toBeNull();
    expect(parseAmount('2 to taste')).toBeNull();
  });
});

describe('amountText', () => {
  it('reads back the same through parseAmount', () => {
    const cases: RecipeIngredient[] = [
      { id: '1', name: 'a', quantity: 12.5, unit: 'g' },
      { id: '2', name: 'b', quantity: 0.5, unit: 'cup' },
      { id: '3', name: 'c', quantity: 2, unit: 'piece' },
      { id: '4', name: 'd', unit: 'to taste' },
      { id: '5', name: 'e', quantity: 1, unit: 'pinch' },
      { id: '6', name: 'f', quantity: 3, unit: 'pinch' },
      { id: '7', name: 'g', quantity: 1.25, unit: 'l' },
    ];
    for (const c of cases) expect(parseAmount(amountText(c))).toEqual({ quantity: c.quantity, unit: c.unit });
    expect(amountText({ unit: 'piece' })).toBe('');
  });
});

describe('drafts', () => {
  const draft = (over: Partial<IngredientDraft>): IngredientDraft => ({ id: 'x', name: 'Basil', amount: '', ...over });

  it('round-trips an ingredient and keeps what the form does not show', () => {
    const ing: RecipeIngredient = { id: 'i1', name: 'Pesto', quantity: 12.5, unit: 'g', optional: true, notes: 'fresh', productId: 'fp-pesto', substitutions: [{ id: 's', useName: 'Basil oil' }] };
    expect(toDraft(ing)).toMatchObject({ name: 'Pesto (optional)', amount: '12.5 g' });
    expect(fromDrafts([toDraft(ing)])).toEqual([ing]);
  });

  it('drops unnamed rows, cleans names and reads "(optional)" off the name', () => {
    const out = fromDrafts([draft({ id: 'a', name: '  ' }), draft({ id: 'b', name: ' Parmesan   (Optional) ', amount: 'to taste' }), draft({ id: 'c', name: 'Eggs', amount: '2' })]);
    expect(out).toEqual([
      { id: 'b', name: 'Parmesan', unit: 'to taste', optional: true },
      { id: 'c', name: 'Eggs', quantity: 2, unit: 'piece' },
    ]);
  });

  it('clears optional when "(optional)" is taken off the name', () => {
    const base: RecipeIngredient = { id: 'i', name: 'Nuts', unit: 'g', quantity: 30, optional: true };
    expect(fromDrafts([{ ...toDraft(base), name: 'Nuts' }])).toEqual([{ id: 'i', name: 'Nuts', unit: 'g', quantity: 30 }]);
  });

  it('flags amounts it cannot read, only on named rows', () => {
    expect(badAmounts([draft({ id: 'a', amount: 'lots' }), draft({ id: 'b', name: '', amount: 'lots' }), draft({ id: 'c', amount: '2 g' })])).toEqual(['a']);
  });
});
