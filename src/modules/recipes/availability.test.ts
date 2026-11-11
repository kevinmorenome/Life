import { describe, expect, it } from 'vitest';
import type { ProductSummary } from '../food/products';
import type { Stock } from '../food/stock';
import type { Unit } from '../food/types';
import { checkIngredient, checkRecipe, matchProduct, moreText, stapleKey, stockMap, suggestProducts, type StockedProduct } from './availability';
import type { RecipeIngredient } from './types';

const product = (name: string, unit: Unit, date = '2026-11-01', rawName?: string): ProductSummary => ({
  id: `fp-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  name,
  kind: 'food',
  unit,
  type: 'staple',
  storage: 'pantry',
  hasPhoto: false,
  custom: false,
  purchases: [{ receiptId: 'r', date, store: 'Konzum', quantity: 1, unit, unitPrice: 1, paid: 1, batch: 'r:0', rawName }],
});
const stock = (quantity: number): Stock => ({ quantity, batches: [], frozenQuantity: 0, thawedQuantity: 0, history: {}, pastBatches: [], status: quantity > 0 ? 'ok' : 'out' });

const pasta = product('Pasta', 'kg');
const milk = product('Milk', 'l');
const eggs = product('Eggs', 'pc');
const tortellini = product('Tortellini sa sirom', 'pc', '2026-11-05', 'TORTELLINI SIR 250G');
const pesto = product('Pesto genovese', 'pc');
const all = [pasta, milk, eggs, tortellini, pesto];
const entries: StockedProduct[] = [
  { product: pasta, stock: stock(0.5) },
  { product: milk, stock: stock(0.25) },
  { product: eggs, stock: stock(6) },
  { product: tortellini, stock: stock(2) },
  { product: pesto, stock: stock(0) },
];
const map = stockMap(entries);
const none = new Set<string>();
const ing = (over: Partial<RecipeIngredient>): RecipeIngredient => ({ id: 'i', name: 'Pasta', unit: 'g', ...over });
const check = (over: Partial<RecipeIngredient>, staples = none) => checkIngredient(ing(over), map, all, staples);

describe('matchProduct', () => {
  it('finds a product by its name, or by all the words of the ingredient', () => {
    expect(matchProduct('pasta', all)).toBe(pasta);
    expect(matchProduct('Tortellini', all)).toBe(tortellini);
    expect(matchProduct('egg', all)).toBe(eggs);
    expect(matchProduct('pesto rosso', all)).toBeUndefined();
    expect(matchProduct('', all)).toBeUndefined();
  });
});

describe('suggestProducts', () => {
  it('suggests by name and by receipt text', () => {
    expect(suggestProducts('tort', all)).toEqual([tortellini]);
    expect(suggestProducts('sir', all)).toEqual([tortellini]);
    expect(suggestProducts('', all)).toEqual([]);
  });
});

describe('checkIngredient', () => {
  it('converts units within a family (acceptance: 200 g against 0.5 kg)', () => {
    expect(check({ quantity: 200, unit: 'g', productId: pasta.id })).toMatchObject({ state: 'available', product: pasta, matched: false });
  });
  it('says how much more is needed (acceptance: 300 g against 100 g)', () => {
    const map100 = stockMap([{ product: pasta, stock: stock(0.1) }]);
    const c = checkIngredient(ing({ quantity: 300, unit: 'g', productId: pasta.id }), map100, all, none);
    expect(c.state).toBe('partial');
    expect(c.more).toBeCloseTo(200);
    expect(moreText(c.more!, 'g')).toBe('200 g more');
  });
  it('converts cups to millilitres', () => {
    expect(check({ name: 'Milk', quantity: 1, unit: 'cup' }).state).toBe('available'); // 237 ml ≤ 250 ml
    const c = check({ name: 'Milk', quantity: 2, unit: 'cup' });
    expect(c.state).toBe('partial');
    expect(moreText(c.more!, 'cup')).toBe('1 cup more'); // 473 − 250 = 223 ml ≈ 0.94 cup
  });
  it('counts pieces against pieces', () => {
    expect(check({ name: 'Eggs', quantity: 4, unit: 'piece' }).state).toBe('available');
    expect(check({ name: 'Eggs', quantity: 8, unit: 'piece' })).toMatchObject({ state: 'partial', more: 2 });
  });
  it('takes any stock as enough, unverified, when the units differ', () => {
    expect(check({ name: 'Tortellini', quantity: 250, unit: 'g' })).toMatchObject({ state: 'available', unverified: true, matched: true, product: tortellini });
  });
  it('is missing when there is none, or no product at all', () => {
    expect(check({ name: 'Pesto', quantity: 4, unit: 'tbsp' })).toMatchObject({ state: 'missing', product: pesto });
    expect(check({ name: 'Saffron', quantity: 1, unit: 'pinch' })).toEqual({ ingredient: expect.anything(), state: 'missing' });
  });
  it('needs no amount for to taste', () => {
    expect(check({ name: 'Eggs', unit: 'to taste' }).state).toBe('available');
  });
  it('treats staples as always there', () => {
    expect(check({ name: 'Salt', unit: 'to taste' }, new Set([stapleKey('salt')]))).toMatchObject({ state: 'available', staple: true });
  });
});

describe('checkRecipe', () => {
  it('never lets an optional ingredient stop you (acceptance)', () => {
    const r = checkRecipe([ing({ name: 'Pasta', quantity: 200 }), ing({ id: 'p', name: 'Pesto', quantity: 4, unit: 'tbsp', optional: true })], map, all, none);
    expect(r.canCook).toBe(true);
    expect(r.items[1].state).toBe('missing');
  });
  it('lists what is lacking', () => {
    const r = checkRecipe([ing({ name: 'Pasta', quantity: 900 }), ing({ id: 'p', name: 'Pesto', quantity: 4, unit: 'tbsp' })], map, all, none);
    expect(r.canCook).toBe(false);
    expect(r.lacking.map((c) => c.ingredient.name)).toEqual(['Pasta', 'Pesto']);
  });
});
