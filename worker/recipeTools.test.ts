import { describe, expect, it } from 'vitest';
import type { ToolContext } from './mcpTools';
import type { ReadStore, RecordStore, Row } from './records';
import { callRecipeTool } from './recipeTools';

function setup(seed: Partial<Record<ReadStore, Row[]>> = {}, readOnly = false) {
  const data = new Map<string, Map<string, Row>>();
  const of = (s: string) => data.get(s) ?? data.set(s, new Map()).get(s)!;
  for (const [s, rows] of Object.entries(seed)) for (const r of rows!) of(s).set(r.id, r);
  const store: RecordStore = {
    list: async (s) => [...of(s).values()],
    put: async (s, id, record) => void of(s).set(id, { id, ...record }),
    photos: async () => new Map(),
  };
  let n = 0;
  const ctx: ToolContext = { store, readOnly, now: new Date('2026-11-12T12:00:00Z'), newId: () => `id-${++n}`, appUrl: 'https://life.test' };
  const run = async (name: string, args: Record<string, unknown>) => {
    const r = (await callRecipeTool(name, args, ctx))!;
    return { isError: !!r.isError, text: r.text, json: () => JSON.parse(r.text) };
  };
  return { run, rows: (s: string) => [...of(s).values()] };
}

const line = (name: string, quantity: number, unit: 'pc' | 'kg' | 'l') => ({ name, kind: 'food', quantity, unit, unitPrice: 1, discount: 0, paid: quantity });
const FOOD: Partial<Record<ReadStore, Row[]>> = {
  foodreceipts: [{ id: 'food-1', store: 'Konzum', date: '2026-11-10', total: 5, lines: [line('Pasta', 0.5, 'kg'), line('Eggs', 6, 'pc'), line('Tortellini sa sirom', 2, 'pc')] }],
  settings: [{ id: 'app', pantryStaples: ['salt'] }],
};
const PESTO: Row = {
  id: 'r1',
  name: 'Pesto tortellini',
  servings: 2,
  tags: ['dinner'],
  steps: ['Boil the tortellini. Cook for 10 minutes.', 'Stir in the pesto.'],
  ingredients: [
    { id: 'a', name: 'Pasta', quantity: 200, unit: 'g' },
    { id: 'b', name: 'Eggs', quantity: 2, unit: 'piece' },
    { id: 'c', name: 'Pesto', quantity: 4, unit: 'tbsp' },
    { id: 'd', name: 'Salt', unit: 'to taste' },
    { id: 'e', name: 'Tortellini', quantity: 250, unit: 'g' },
  ],
  cooked: ['2026-11-01'],
  createdAt: '2026-11-01T00:00:00Z',
};

describe('add_recipe', () => {
  it('adds a recipe with parsed amounts and says what each ingredient matches', async () => {
    const t = setup(FOOD);
    const r = await t.run('add_recipe', {
      name: 'Carbonara',
      servings: 2,
      cookTime: 15,
      tags: ['Dinner', 'quick'],
      ingredients: [{ name: 'Pasta', amount: '200 g' }, { name: 'Eggs', amount: '2' }, { name: 'Parmesan', amount: 'to taste', optional: true }],
      steps: ['Boil the pasta. Cook for 9 minutes.', 'Mix with the eggs.'],
    });
    expect(r.isError).toBe(false);
    const saved = t.rows('recipes')[0];
    expect(saved).toMatchObject({ name: 'Carbonara', servings: 2, cookTime: 15, tags: ['dinner', 'quick'], cooked: [] });
    expect(saved.ingredients).toEqual([
      { id: 'id-1', name: 'Pasta', quantity: 200, unit: 'g' },
      { id: 'id-2', name: 'Eggs', quantity: 2, unit: 'piece' },
      { id: 'id-3', name: 'Parmesan', unit: 'to taste', optional: true },
    ]);
    expect(r.json().ingredients.map((i: { matchesProduct: string | null }) => i.matchesProduct)).toEqual(['Pasta', 'Eggs', null]);
  });
  it('refuses amounts it cannot read, duplicates and read-only deployments', async () => {
    expect((await setup(FOOD).run('add_recipe', { name: 'X', ingredients: [{ name: 'Flour', amount: 'lots' }], steps: [] })).text).toMatch(/Can't read/);
    const dup = await setup({ ...FOOD, recipes: [PESTO] }).run('add_recipe', { name: 'pesto tortellini', ingredients: [], steps: [] });
    expect(dup.isError).toBe(true);
    expect(dup.text).toMatch(/confirmDuplicate/);
    expect((await setup(FOOD, true).run('add_recipe', { name: 'X', ingredients: [], steps: [] })).text).toMatch(/read-only/);
  });
});

describe('list_recipes and get_recipe', () => {
  it('lists recipes with what is lacking', async () => {
    const r = (await setup({ ...FOOD, recipes: [PESTO] }).run('list_recipes', {})).json();
    expect(r.recipes[0]).toMatchObject({ name: 'Pesto tortellini', timesCooked: 1, lastCooked: '2026-11-01', canCook: false });
    expect(r.recipes[0].lacking).toEqual(['Pesto (missing)']);
    expect((await setup({ ...FOOD, recipes: [PESTO] }).run('list_recipes', { cookableOnly: true })).json().count).toBe(0);
  });
  it('gives a recipe scaled, with its stock and what would come off', async () => {
    const r = (await setup({ ...FOOD, recipes: [PESTO] }).run('get_recipe', { recipe: 'pesto', servings: 4 })).json();
    expect(r.servings).toBe(4);
    const by = (n: string) => r.ingredients.find((i: { name: string }) => i.name === n);
    expect(by('Pasta')).toMatchObject({ amount: '400 g', stock: 'in stock', takeOff: { quantity: 0.4, unit: 'kg' } });
    expect(by('Eggs')).toMatchObject({ amount: '4', takeOff: { quantity: 4, unit: 'pieces' } });
    expect(by('Salt').stock).toBe('always in the pantry');
    expect(by('Tortellini').takeOff).toMatchObject({ quantity: 1, check: expect.stringMatching(/guess/) });
    expect(r.steps[0]).toEqual({ step: 1, text: 'Boil the tortellini. Cook for 10 minutes.', timers: ['10 minutes'] });
    expect(r.links.cookInApp).toBe('https://life.test/#/recipes/r1/cook/4');
  });
  it('asks when a name is ambiguous', async () => {
    const r = await setup({ recipes: [PESTO, { ...PESTO, id: 'r2', name: 'Pesto pasta' }] }).run('get_recipe', { recipe: 'pesto' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/Several recipes/);
  });
});

describe('log_cooked', () => {
  it('queues the cooked day and takes the confirmed amounts off the stock', async () => {
    const t = setup({ ...FOOD, recipes: [PESTO] });
    const r = await t.run('log_cooked', { recipe: 'r1', stock: 'suggested', amounts: [{ ingredient: 'eggs', quantity: 1 }, { ingredient: 'Tortellini', quantity: 0 }] });
    expect(r.isError).toBe(false);
    expect(t.rows('inbox')).toEqual([expect.objectContaining({ id: 'cooked-r1-2026-11-12', type: 'cooked', recipeId: 'r1', date: '2026-11-12' })]);
    expect(t.rows('foodstock').map((e) => [e.productId, e.type, e.quantity, e.note])).toEqual([
      ['fp-pasta', 'use', 0.2, 'Cooked Pesto tortellini'],
      ['fp-eggs', 'use', 1, 'Cooked Pesto tortellini'],
    ]);
    expect(r.json().notTakenOff).toEqual(['Pesto: not among the groceries bought, not counted', 'Salt: always in the pantry, not counted']);
  });
  it('never logs the same day twice, nor takes stock twice', async () => {
    const t = setup({ ...FOOD, recipes: [PESTO] });
    await t.run('log_cooked', { recipe: 'r1', stock: 'suggested' });
    const again = await t.run('log_cooked', { recipe: 'r1', stock: 'suggested' });
    expect(again.json().alreadyLogged).toBe(true);
    expect(t.rows('foodstock')).toHaveLength(3);
    expect((await t.run('log_cooked', { recipe: 'r1', date: '2026-11-01', stock: 'none' })).json().alreadyLogged).toBe(true);
  });
  it('can record the day only, and checks its input', async () => {
    const t = setup({ ...FOOD, recipes: [PESTO] });
    expect((await t.run('log_cooked', { recipe: 'r1', stock: 'none', date: '2026-11-11' })).json().takenOffStock).toMatch(/not changed/);
    expect(t.rows('foodstock')).toHaveLength(0);
    expect((await t.run('log_cooked', { recipe: 'r1' })).text).toMatch(/stock must be/);
    expect((await t.run('log_cooked', { recipe: 'r1', stock: 'none', date: '2026-12-01' })).text).toMatch(/future/);
    expect((await t.run('log_cooked', { recipe: 'r1', stock: 'suggested', amounts: [{ ingredient: 'Chocolate', quantity: 1 }] })).text).toMatch(/not an ingredient/);
  });
});
