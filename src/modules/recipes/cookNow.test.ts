import { describe, expect, it } from 'vitest';
import type { ProductSummary } from '../food/products';
import type { Stock } from '../food/stock';
import type { Unit } from '../food/types';
import { stockMap, type StockedProduct } from './availability';
import { lackingText, rankRecipes, useSoonText } from './cookNow';
import type { Recipe, RecipeIngredient } from './types';

const product = (name: string, unit: Unit = 'pc'): ProductSummary => ({
  id: `fp-${name.toLowerCase()}`,
  name,
  kind: 'food',
  unit,
  type: 'fresh',
  storage: 'fridge',
  hasPhoto: false,
  custom: false,
  purchases: [{ receiptId: 'r', date: '2026-11-01', store: 'Konzum', quantity: 1, unit, unitPrice: 1, paid: 1, batch: 'r:0' }],
});
const stock = (quantity: number, useBy?: string): Stock => ({ quantity, batches: [], frozenQuantity: 0, thawedQuantity: 0, history: {}, pastBatches: [], status: quantity > 0 ? 'ok' : 'out', ...(useBy ? { useBy } : {}) });

const names = ['Tomato', 'Basil', 'Pasta', 'Cream', 'Eggs', 'Cheese'];
const products = names.map((n) => product(n));
const have = (useBy: Record<string, string> = {}, out: string[] = []): StockedProduct[] => products.map((p) => ({ product: p, stock: stock(out.includes(p.name) ? 0 : 2, useBy[p.name]) }));

const ing = (name: string, optional = false): RecipeIngredient => ({ id: name, name, quantity: 1, unit: 'piece', ...(optional ? { optional } : {}) });
const recipe = (name: string, ingredients: string[], over: Partial<Recipe> = {}): Recipe => ({ id: name, name, ingredients: ingredients.map((n) => ing(n)), steps: [], servings: 2, tags: [], createdAt: '', updatedAt: '', ...over });
const rank = (rs: Recipe[], entries: StockedProduct[], filter = { tags: [] as string[] } as { tags: string[]; maxMinutes?: number }) => rankRecipes(rs, stockMap(entries), products, new Set(), '2026-11-11', filter);

describe('rankRecipes', () => {
  it('groups by how much is lacking', () => {
    const r = rank([recipe('A', ['Tomato']), recipe('B', ['Tomato', 'Cream']), recipe('C', ['Cream', 'Eggs', 'Cheese'])], have({}, ['Cream', 'Eggs', 'Cheese']));
    expect(r.map((c) => [c.recipe.name, c.group, c.lacking.length])).toEqual([['A', 'now', 0], ['B', 'almost', 1], ['C', 'rest', 3]]);
  });

  it('never counts optional ingredients as lacking', () => {
    const r = rank([{ ...recipe('A', ['Tomato']), ingredients: [ing('Tomato'), ing('Cream', true)] }], have({}, ['Cream']));
    expect(r[0].group).toBe('now');
  });

  it('puts recipes using food about to expire first, soonest first', () => {
    const r = rank([recipe('A', ['Pasta']), recipe('B', ['Basil']), recipe('C', ['Tomato'])], have({ Basil: '2026-11-13', Tomato: '2026-11-11' }));
    expect(r.map((c) => c.recipe.name)).toEqual(['C', 'B', 'A']);
    expect(r[0].useSoon).toEqual([{ name: 'Tomato', days: 0 }]);
  });

  it('ignores missing and far or past use-by dates', () => {
    const r = rank([recipe('A', ['Pasta']), recipe('B', ['Basil']), recipe('C', ['Tomato'])], have({ Basil: '2026-11-30', Tomato: '2026-11-05' }));
    expect(r.map((c) => c.recipe.name)).toEqual(['A', 'B', 'C']);
    expect(r.every((c) => c.useSoon.length === 0)).toBe(true);
  });

  it('does not let an expiring ingredient lift a recipe out of its group', () => {
    const r = rank([recipe('Lacking', ['Basil', 'Cream']), recipe('Ready', ['Pasta'])], have({ Basil: '2026-11-11' }, ['Cream']));
    expect(r.map((c) => c.recipe.name)).toEqual(['Ready', 'Lacking']);
  });

  it('favours favourites, then fewer lacking, when nothing is expiring', () => {
    const r = rank([recipe('B', ['Pasta']), recipe('A', ['Pasta']), recipe('F', ['Pasta'], { favorite: true })], have());
    expect(r.map((c) => c.recipe.name)).toEqual(['F', 'A', 'B']);
  });

  it('filters by tag and by time, keeping recipes with no time', () => {
    const rs = [recipe('Quick', ['Pasta'], { tags: ['dinner'], cookTime: 10 }), recipe('Slow', ['Pasta'], { tags: ['dinner'], cookTime: 90 }), recipe('Untimed', ['Pasta'], { tags: ['dinner'] }), recipe('Other', ['Pasta'], { tags: ['lunch'] })];
    expect(rank(rs, have(), { tags: ['dinner'], maxMinutes: 30 }).map((c) => c.recipe.name)).toEqual(['Quick', 'Untimed']);
  });

  it('skips recipes without ingredients', () => {
    expect(rank([recipe('Empty', [])], have())).toEqual([]);
  });

  it('stays quick with hundreds of recipes and products', () => {
    const many = Array.from({ length: 3000 }, (_, i) => product(`Product ${i}`));
    const entries = many.map((p) => ({ product: p, stock: stock(2) }));
    const rs = Array.from({ length: 500 }, (_, i) => recipe(`R${i}`, ['Product 7', 'Product 1999', 'Unknown thing', `Product ${i}`, 'Salt']));
    const t = Date.now();
    const r = rankRecipes(rs, stockMap(entries), many, new Set(), '2026-11-11');
    expect(r).toHaveLength(500);
    expect(Date.now() - t).toBeLessThan(5000);
  });
});

describe('texts', () => {
  it('says what is lacking', () => {
    const lacking = (...n: string[]) => n.map((name) => ({ ingredient: ing(name), state: 'missing' as const }));
    expect(lackingText(lacking('Cream'))).toBe('You are only lacking Cream');
    expect(lackingText(lacking('Cream', 'Eggs'))).toBe('You are only lacking Cream and Eggs');
    expect(lackingText(lacking('A', 'B', 'C', 'D', 'E'))).toBe('Lacking A, B, C and 2 more');
    expect(lackingText([])).toBe('');
  });
  it('says what it uses up', () => {
    expect(useSoonText([{ name: 'Tomato', days: 0 }, { name: 'Milk', days: 1 }])).toBe('Uses up Tomato (today) and Milk (tomorrow)');
    expect(useSoonText([])).toBe('');
  });
});
