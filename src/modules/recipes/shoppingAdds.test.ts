import { describe, expect, it } from 'vitest';
import type { ProductSummary } from '../food/products';
import { withAdds } from '../food/shopping';
import type { Stock } from '../food/stock';
import type { ShoppingAdd } from '../food/types';
import type { IngredientCheck } from './availability';
import { planAdds } from './shoppingAdds';

const milk: ProductSummary = { id: 'fp-milk', name: 'Milk', kind: 'food', unit: 'l', type: 'staple', storage: 'fridge', hasPhoto: false, custom: false, purchases: [{ receiptId: 'r', date: '2026-11-01', store: 'Konzum', quantity: 1, unit: 'l', unitPrice: 1, paid: 1, batch: 'r:0' }] };
const stock: Stock = { quantity: 1, batches: [], frozenQuantity: 0, thawedQuantity: 0, history: {}, pastBatches: [], status: 'ok' };
const missing = (name: string, product?: ProductSummary, over: Partial<IngredientCheck> = {}): IngredientCheck => ({ ingredient: { id: name, name, quantity: 200, unit: 'g' }, state: 'missing', ...(product ? { product } : {}), ...over });
const recipe = { id: 'r1', name: 'Carbonara' };
const day = '2026-11-11';

describe('planAdds', () => {
  it('makes one entry per lacking ingredient with the amount and the recipe', () => {
    const p = planAdds(recipe, [missing('Guanciale'), missing('Milk', milk, { state: 'partial', more: 0.5, ingredient: { id: 'm', name: 'Milk', quantity: 1, unit: 'l' } })], [], day, 'now');
    expect(p.added).toBe(2);
    expect(p.save.map((a) => [a.id, a.productId, a.notes])).toEqual([
      ['shop-guanciale', undefined, [{ forId: 'r1', forName: 'Carbonara', amount: '200 g' }]],
      ['shop-fp-milk', 'fp-milk', [{ forId: 'r1', forName: 'Carbonara', amount: '0.5 l more' }]],
    ]);
  });

  it('adding twice changes nothing', () => {
    const first = planAdds(recipe, [missing('Guanciale')], [], day, 'now');
    const again = planAdds(recipe, [missing('Guanciale')], first.save, day, 'later');
    expect(again).toEqual({ save: [], added: 0, already: 1 });
  });

  it('keeps one entry when two recipes need the same thing, and replaces a changed amount', () => {
    const first = planAdds(recipe, [missing('Guanciale')], [], day, 'now');
    const other = planAdds({ id: 'r2', name: 'Amatriciana' }, [missing('guanciale')], first.save, day, 'now');
    expect(other.save).toHaveLength(1);
    expect(other.save[0].notes.map((n) => n.forName)).toEqual(['Carbonara', 'Amatriciana']);
    const changed = planAdds(recipe, [missing('Guanciale', undefined, { ingredient: { id: 'g', name: 'Guanciale', quantity: 400, unit: 'g' } })], other.save, day, 'now');
    expect(changed.save[0].notes.map((n) => [n.forName, n.amount])).toEqual([['Amatriciana', '200 g'], ['Carbonara', '400 g']]);
  });
});

describe('withAdds', () => {
  const add = (over: Partial<ShoppingAdd> = {}): ShoppingAdd => ({ id: 'shop-guanciale', name: 'Guanciale', notes: [{ forId: 'r1', forName: 'Carbonara', amount: '200 g' }], addedOn: day, createdAt: '', updatedAt: '', ...over });
  it('lists an added entry under its own reason', () => {
    const list = withAdds([], [add()], []);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Guanciale', reason: 'recipe', addId: 'shop-guanciale', for: ['Carbonara: 200 g'] });
  });
  it('does not repeat a product already on the list, it only gains the reason', () => {
    const base = { productId: 'fp-milk', name: 'Milk', reason: 'out' as const, quantity: 1, unit: 'l' as const, daysSince: 3, per: '' };
    const list = withAdds([base], [add({ id: 'shop-fp-milk', productId: 'fp-milk', name: 'Milk' })], [{ product: milk, stock }]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ reason: 'out', for: ['Carbonara: 200 g'], addId: 'shop-fp-milk' });
  });
  it('drops an entry whose product was bought after it was added', () => {
    const bought = { ...milk, purchases: [{ ...milk.purchases[0], date: '2026-11-12' }] };
    expect(withAdds([], [add({ id: 'shop-fp-milk', productId: 'fp-milk', name: 'Milk' })], [{ product: bought, stock }])).toEqual([]);
  });
  it('keeps one added before an older purchase', () => {
    expect(withAdds([], [add({ id: 'shop-fp-milk', productId: 'fp-milk', name: 'Milk' })], [{ product: milk, stock }])).toHaveLength(1);
  });
});
