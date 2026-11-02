import { describe, expect, it } from 'vitest';
import { searchProducts } from './productSearch';
import { productSummaries } from './products';
import type { FoodReceipt, ReceiptLine } from './types';

const line = (over: Partial<ReceiptLine>): ReceiptLine => {
  const l = { name: 'Milk', kind: 'food', quantity: 1, unit: 'pc', unitPrice: 1, discount: 0, paid: 0, ...over } as ReceiptLine;
  return { ...l, paid: Math.round(l.quantity * l.unitPrice * 100) / 100 };
};
let n = 0;
const receipt = (store: string, date: string, lines: ReceiptLine[]): FoodReceipt => ({ id: `r${n++}`, store, date, lines, createdAt: '', updatedAt: '' });

const all = productSummaries(
  [
    receipt('Konzum', '2026-10-01', [line({ name: 'Heinz ketchup', rawName: 'KECAP HEINZ 570G', unitPrice: 3.2 }), line({ name: 'Milk', unitPrice: 1.1 })]),
    receipt('Lidl', '2026-10-10', [line({ name: 'Heinz ketchup', rawName: 'KETCHUP HEINZ', unitPrice: 2.8 }), line({ name: 'Tomato soup', unitPrice: 1.5 })]),
    receipt('Konzum', '2026-10-25', [line({ name: 'Heinz ketchup', rawName: 'KECAP HEINZ 570G', unitPrice: 3.5, discount: 0.3 }), line({ name: 'Ketchup spice mix', unitPrice: 0.9 })]),
  ],
  [],
);

describe('searchProducts', () => {
  it('finds a product by a word of its name and reports the last price, store and date', () => {
    const hits = searchProducts(all, 'ketchup');
    expect(hits.map((h) => h.product.name)).toEqual(['Heinz ketchup', 'Ketchup spice mix']);
    expect(hits[0].last).toMatchObject({ store: 'Konzum', date: '2026-10-25', unitPrice: 3.5 });
  });
  it('mentions a clearly cheaper earlier price', () => {
    const [hit] = searchProducts(all, 'heinz');
    expect(hit.cheaper).toMatchObject({ store: 'Lidl', unitPrice: 2.8 });
    expect(searchProducts(all, 'milk')[0].cheaper).toBeUndefined();
  });
  it('ignores case and accents, and needs every word', () => {
    expect(searchProducts(all, 'tomato')[0].product.name).toBe('Tomato soup');
    expect(searchProducts(all, 'Ketchup').map((h) => h.product.name)).toEqual(searchProducts(all, 'KÉTCHUP').map((h) => h.product.name));
    expect(searchProducts(all, 'heinz ketchup').map((h) => h.product.name)).toEqual(['Heinz ketchup']);
    expect(searchProducts(all, 'heinz soup')).toEqual([]);
  });
  it('also searches the text printed on the receipt', () => {
    expect(searchProducts(all, 'kecap').map((h) => h.product.name)).toEqual(['Heinz ketchup']);
  });
  it('lists everything, newest first, when nothing is typed', () => {
    expect(searchProducts(all, '  ').map((h) => h.product.name)).toEqual(['Heinz ketchup', 'Ketchup spice mix', 'Tomato soup', 'Milk']);
  });
});
