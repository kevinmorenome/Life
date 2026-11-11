import { describe, expect, it } from 'vitest';
import type { ProductSummary } from '../food/products';
import type { Unit } from '../food/types';
import type { IngredientCheck } from './availability';
import { clock, cookLines, inProductUnit, markCooked, parseUsed, startingAmounts, stepIngredients, stepTimers, usesToLog } from './cooking';
import type { Recipe, RecipeIngredient } from './types';

const product = (id: string, unit: Unit): ProductSummary => ({ id, name: id, kind: 'food', unit, type: 'staple', storage: 'pantry', hasPhoto: false, custom: false, purchases: [] });
const ing = (over: Partial<RecipeIngredient>): RecipeIngredient => ({ id: over.name ?? 'x', name: 'x', unit: 'g', ...over });
const check = (i: Partial<RecipeIngredient>, p?: ProductSummary, staple = false): IngredientCheck => ({ ingredient: ing(i), state: 'available', product: p, staple });

const pasta = product('pasta', 'kg');
const milk = product('milk', 'l');
const eggs = product('eggs', 'pc');
const tortellini = product('tortellini', 'pc');
const left: Record<string, number> = { pasta: 0.5, milk: 0.2, eggs: 6, tortellini: 2 };
const leftOf = (id: string) => left[id] ?? 0;

describe('inProductUnit', () => {
  it('converts to the product unit', () => {
    expect(inProductUnit({ quantity: 200, unit: 'g' }, pasta)).toBeCloseTo(0.2);
    expect(inProductUnit({ quantity: 1, unit: 'cup' }, milk)).toBeCloseTo(0.237, 3);
    expect(inProductUnit({ quantity: 3, unit: 'piece' }, eggs)).toBe(3);
    expect(inProductUnit({ quantity: 250, unit: 'g' }, tortellini)).toBeUndefined();
    expect(inProductUnit({ unit: 'to taste' }, pasta)).toBeUndefined();
  });
});

describe('cookLines', () => {
  it('pre-fills the recipe amount, capped at what is there', () => {
    const [a, b, c] = cookLines([check({ name: 'Pasta', quantity: 200, unit: 'g' }, pasta), check({ name: 'Milk', quantity: 2, unit: 'cup' }, milk), check({ name: 'Eggs', quantity: 3, unit: 'piece' }, eggs)], leftOf);
    expect(a).toMatchObject({ amount: 0.2, basis: 'converted', left: 0.5 });
    expect(b).toMatchObject({ amount: 0.2, basis: 'converted' }); // 473 ml wanted, 0.2 l there
    expect(c).toMatchObject({ amount: 3, basis: 'converted' });
  });
  it('guesses one pack when the units differ, and asks when there is no amount', () => {
    const [a, b] = cookLines([check({ name: 'Tortellini', quantity: 250, unit: 'g' }, tortellini), check({ name: 'Oil', unit: 'to taste' }, milk)], leftOf);
    expect(a).toMatchObject({ amount: 1, basis: 'guess' });
    expect(b).toMatchObject({ amount: 0, basis: 'unknown' });
  });
  it('tracks nothing for staples, unlinked ingredients and products with none left', () => {
    const lines = cookLines([check({ name: 'Salt', unit: 'to taste' }, undefined, true), check({ name: 'Saffron', unit: 'pinch' }), check({ name: 'Pesto', quantity: 2, unit: 'tbsp' }, product('pesto', 'pc'))], leftOf);
    expect(lines.map((l) => l.notTracked)).toEqual(['staple', 'unlinked', 'none-left']);
  });
});

describe('usesToLog', () => {
  const lines = cookLines([check({ name: 'Pasta', quantity: 200, unit: 'g' }, pasta), check({ name: 'Eggs', quantity: 3, unit: 'piece' }, eggs), check({ name: 'Salt', unit: 'to taste' }, undefined, true)], leftOf);
  it('logs the confirmed amounts, never below zero (acceptance)', () => {
    expect(usesToLog(lines, {})).toEqual([
      { productId: 'pasta', quantity: 0.2 },
      { productId: 'eggs', quantity: 3 },
    ]);
    expect(usesToLog(lines, { Pasta: 0.9, Eggs: 0 })).toEqual([{ productId: 'pasta', quantity: 0.5 }]);
    expect(usesToLog(lines, { Pasta: -1 })).toEqual([{ productId: 'eggs', quantity: 3 }]);
  });
});

describe('markCooked', () => {
  it('adds the day once, in order', () => {
    const r = { id: 'r', cooked: ['2026-11-01'] } as Recipe;
    expect(markCooked(markCooked(r, '2026-11-11', 'now'), '2026-11-11', 'now').cooked).toEqual(['2026-11-01', '2026-11-11']);
    expect(markCooked({ id: 'r' } as Recipe, '2026-11-11', 'now').cooked).toEqual(['2026-11-11']);
  });
});

describe('startingAmounts', () => {
  const lines = cookLines([check({ name: 'Pasta', quantity: 200, unit: 'g' }, pasta), check({ name: 'Eggs', quantity: 3, unit: 'piece' }, eggs)], leftOf);
  it('keeps every pre-filled amount when nothing was ticked', () => {
    expect(startingAmounts(lines, new Set())).toEqual({ Pasta: 0.2, Eggs: 3 });
  });
  it('starts what was left unticked at 0', () => {
    expect(startingAmounts(lines, new Set(['Pasta']))).toEqual({ Pasta: 0.2, Eggs: 0 });
  });
});

describe('parseUsed', () => {
  it('reads none as 0, not as a mistake', () => {
    expect(parseUsed('0')).toBe(0);
    expect(parseUsed('0,0')).toBe(0);
    expect(parseUsed('')).toBe(0);
    expect(parseUsed('0.2')).toBe(0.2);
    expect(parseUsed('½')).toBe(0.5);
    expect(parseUsed('lots')).toBeNaN();
  });
});

describe('stepTimers', () => {
  it('finds the times a step mentions', () => {
    expect(stepTimers('Boil de tortellini during 10 minutes')).toEqual([{ seconds: 600, label: '10 minutes' }]);
    expect(stepTimers('Bake 1 hour, then rest 30 sec')).toEqual([
      { seconds: 3600, label: '1 hour' },
      { seconds: 30, label: '30 sec' },
    ]);
    expect(stepTimers('Simmer 8-10 min')).toEqual([{ seconds: 600, label: '8-10 min' }]);
    expect(stepTimers('Simmer 1,5 h')).toEqual([{ seconds: 5400, label: '1,5 h' }]);
  });
  it('ignores numbers that are not times', () => {
    expect(stepTimers('Add 200 g pasta and 2 eggs')).toEqual([]);
    expect(stepTimers('Heat the oven to 180 degrees')).toEqual([]);
  });
  it('shows a countdown', () => {
    expect(clock(545)).toBe('9:05');
    expect(clock(3720)).toBe('1:02:00');
    expect(clock(-3)).toBe('0:00');
  });
});

describe('stepIngredients', () => {
  const list = [{ name: 'Tortellini' }, { name: 'Olive oil' }, { name: 'Eggs' }, { name: 'Parmesan' }];
  it('finds the ingredients named in a step, whole words only', () => {
    expect(stepIngredients('Boil de tortellini during 10 minutes', list).map((i) => i.name)).toEqual(['Tortellini']);
    expect(stepIngredients('Drain, add a little olive oil and the egg', list).map((i) => i.name)).toEqual(['Olive oil', 'Eggs']);
    expect(stepIngredients('Bring the water to the boil', list)).toEqual([]);
  });
});
