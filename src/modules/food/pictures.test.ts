import { describe, expect, it } from 'vitest';
import { needsPicture } from './pictures';
import type { ProductSummary } from './products';
import { stockOf } from './stock';
import type { Entry } from './stockEntries';

const entry = (name: string, over: Partial<ProductSummary> = {}, qty = 1): Entry => {
  const product: ProductSummary = { id: `fp-${name}`, name, kind: 'food', unit: 'pc', type: 'staple', storage: 'pantry', trackAmount: true, custom: false, purchases: [{ receiptId: 'r', date: '2026-10-31', store: 'K', quantity: qty, unit: 'pc', unitPrice: 1, paid: qty }], ...over };
  return { product, stock: stockOf(product, product.purchases, [], '2026-11-02'), uses: 0 };
};

describe('needsPicture', () => {
  it('lists what you have without a picture, fridge first, then by name', () => {
    const out = needsPicture([entry('Oat drink'), entry('Hummus', { storage: 'fridge' }), entry('Beer'), entry('Peas', { storage: 'freezer' }), entry('Chicken', { storage: 'fridge' })]);
    expect(out.map((e) => e.product.name)).toEqual(['Chicken', 'Hummus', 'Beer', 'Oat drink', 'Peas']);
  });
  it('leaves out products that have a picture and ones that are used up', () => {
    const out = needsPicture([entry('Has photo', { photo: 'data:image/webp;base64,AAAA' }), entry('Gone', {}, 0), entry('Needs one')]);
    expect(out.map((e) => e.product.name)).toEqual(['Needs one']);
  });
});
