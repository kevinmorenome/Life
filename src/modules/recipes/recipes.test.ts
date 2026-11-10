import { describe, expect, it } from 'vitest';
import { cleanSteps, duplicateRecipe, formatMinutes, moveItem, parseTags, sortRecipes, totalMinutes } from './recipes';
import type { Recipe } from './types';

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r1',
  name: 'Pasta',
  ingredients: [{ id: 'i1', name: 'Pasta', quantity: 200, unit: 'g', productId: 'fp-pasta', substitutions: [{ id: 's1', useName: 'Rice' }] }],
  steps: ['Boil', 'Drain'],
  servings: 2,
  tags: ['dinner'],
  favorite: true,
  cooked: ['2026-11-01'],
  hasPhoto: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...over,
});

describe('parseTags', () => {
  it('splits, trims, lower-cases and dedupes', () => {
    expect(parseTags(' Dinner, quick ,, dinner,  Very   spicy ')).toEqual(['dinner', 'quick', 'very spicy']);
    expect(parseTags('')).toEqual([]);
  });
});

describe('cleanSteps', () => {
  it('drops empty steps', () => {
    expect(cleanSteps([' Boil ', '', '  ', 'Drain'])).toEqual(['Boil', 'Drain']);
  });
});

describe('moveItem', () => {
  it('swaps with the neighbour', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
  });
  it('leaves the ends alone', () => {
    const list = ['a', 'b'];
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 1, 1)).toBe(list);
  });
});

describe('formatMinutes', () => {
  it('reads like a recipe card', () => {
    expect(formatMinutes(undefined)).toBe('');
    expect(formatMinutes(0)).toBe('');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(90)).toBe('1 h 30 min');
  });
  it('adds prep and cook time', () => {
    expect(totalMinutes({ prepTime: 10, cookTime: 20 })).toBe(30);
    expect(totalMinutes({})).toBe(0);
  });
});

describe('duplicateRecipe', () => {
  it('copies the dish with new ids and no history', () => {
    let n = 0;
    const copy = duplicateRecipe(recipe(), () => `new${++n}`, '2026-11-10T00:00:00.000Z');
    expect(copy.id).toBe('new1');
    expect(copy.name).toBe('Pasta (copy)');
    expect(copy.ingredients[0]).toMatchObject({ id: 'new2', name: 'Pasta', quantity: 200, productId: 'fp-pasta' });
    expect(copy.ingredients[0].substitutions![0]).toEqual({ id: 'new3', useName: 'Rice' });
    expect(copy.favorite).toBeUndefined();
    expect(copy.cooked).toBeUndefined();
    expect(copy.hasPhoto).toBe(true);
    expect(copy.createdAt).toBe('2026-11-10T00:00:00.000Z');
  });
  it('does not share arrays with the original', () => {
    const r = recipe();
    const copy = duplicateRecipe(r, () => 'x', 'now');
    copy.steps.push('Serve');
    copy.tags.push('quick');
    expect(r.steps).toEqual(['Boil', 'Drain']);
    expect(r.tags).toEqual(['dinner']);
  });
});

describe('sortRecipes', () => {
  it('sorts by name ignoring case and accents', () => {
    const names = sortRecipes([recipe({ id: 'a', name: 'zucchini' }), recipe({ id: 'b', name: 'Ćevapi' }), recipe({ id: 'c', name: 'apple pie' })]).map((r) => r.name);
    expect(names).toEqual(['apple pie', 'Ćevapi', 'zucchini']);
  });
});
