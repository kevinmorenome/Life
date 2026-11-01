import { describe, expect, it } from 'vitest';
import { averageUnitPrice, canonicalName, defaultStorage, defaultType, isStocked, normalizeKey, packSizeOf, pluralize, pricePerItem, productId, productSummaries } from './products';
import type { FoodProduct, FoodReceipt, ReceiptLine } from './types';

const line = (over: Partial<ReceiptLine>): ReceiptLine => ({ name: 'Milk', kind: 'food', quantity: 1, unit: 'pc', unitPrice: 1, discount: 0, paid: 1, ...over });
const receipt = (over: Partial<FoodReceipt>): FoodReceipt => ({ id: 'r', store: 'Konzum', date: '2026-10-31', lines: [], createdAt: '', updatedAt: '', ...over });

describe('product ids', () => {
  it('ignore case, accents and punctuation', () => {
    expect(productId('Oat drink 3.5%')).toBe('fp-oat-drink-3-5');
    expect(productId('  PRŠUT  tortellini ')).toBe(productId('prsut tortellini'));
    expect(productId('???')).toBe('fp-item');
    expect(normalizeKey("Lay's")).toBe('lay s');
  });
});

describe('defaults', () => {
  it('guess the type from kind and unit', () => {
    expect(defaultType('alcohol', 'pc')).toBe('drink');
    expect(defaultType('food', 'kg')).toBe('fresh');
    expect(defaultType('food', 'pc')).toBe('staple');
    expect(defaultStorage('fresh')).toBe('fridge');
    expect(defaultStorage('staple')).toBe('pantry');
  });
  it('only stock food and alcohol', () => {
    expect(['food', 'alcohol', 'deposit', 'bag', 'other'].filter((k) => isStocked(k as 'food'))).toEqual(['food', 'alcohol']);
  });
});

describe('canonicalName', () => {
  const earlier = [receipt({ date: '2026-10-01', lines: [line({ name: 'Oat drink 3.5%', rawName: 'NAP ZOB 3,5% MA NO M' })] })];
  it('reuses the name given to the same printed text at the same store', () => {
    expect(canonicalName('Konzum', 'NAP ZOB 3,5% MA NO M', 'Oat milk', earlier)).toBe('Oat drink 3.5%');
    expect(canonicalName('konzum', 'nap zob 3,5% ma no m', 'Oat milk', earlier)).toBe('Oat drink 3.5%');
  });
  it('keeps the given name for another store, other text or no printed text', () => {
    expect(canonicalName('Lidl', 'NAP ZOB 3,5% MA NO M', 'Oat milk', earlier)).toBe('Oat milk');
    expect(canonicalName('Konzum', 'SOMETHING ELSE', 'Oat milk', earlier)).toBe('Oat milk');
    expect(canonicalName('Konzum', undefined, 'Oat milk', earlier)).toBe('Oat milk');
  });
  it('prefers the newest receipt', () => {
    const both = [...earlier, receipt({ date: '2026-10-20', lines: [line({ name: 'Oat drink', rawName: 'NAP ZOB 3,5% MA NO M' })] })];
    expect(canonicalName('Konzum', 'NAP ZOB 3,5% MA NO M', 'x', both)).toBe('Oat drink');
  });
});

describe('productSummaries', () => {
  const receipts = [
    receipt({ id: 'a', date: '2026-10-10', lines: [line({ name: 'Oat drink 3.5%', unitPrice: 4, paid: 4 }), line({ name: 'Carrier bag', kind: 'bag' })] }),
    receipt({ id: 'b', store: 'Lidl', date: '2026-10-31', lines: [line({ name: 'oat drink 3.5%', unitPrice: 3.5, paid: 3.5 }), line({ name: 'Beer', kind: 'alcohol', quantity: 2, unitPrice: 2, paid: 4 })] }),
  ];
  it('groups lines of the same product, newest purchase first, and skips bags', () => {
    const out = productSummaries(receipts, []);
    expect(out.map((p) => p.id)).toEqual(['fp-beer', 'fp-oat-drink-3-5']);
    const oat = out.find((p) => p.id === 'fp-oat-drink-3-5')!;
    expect(oat.purchases.map((x) => [x.store, x.unitPrice])).toEqual([['Lidl', 3.5], ['Konzum', 4]]);
    expect(oat.name).toBe('oat drink 3.5%'); // the newest purchase's wording
    expect(out.find((p) => p.kind === 'bag')).toBeUndefined();
    expect(out).toHaveLength(2);
  });
  it('uses the product record when there is one, otherwise defaults', () => {
    const rec: FoodProduct = { id: 'fp-beer', name: 'Beer', type: 'drink', storage: 'fridge', shelfLifeDays: 90, createdAt: '', updatedAt: '' };
    const out = productSummaries(receipts, [rec]);
    const beer = out.find((p) => p.id === 'fp-beer')!;
    expect(beer).toMatchObject({ storage: 'fridge', shelfLifeDays: 90, custom: true });
    expect(out.find((p) => p.id === 'fp-oat-drink-3-5')).toMatchObject({ type: 'staple', storage: 'pantry', custom: false, trackAmount: true });
    const spice: FoodProduct = { id: 'fp-oat-drink-3-5', name: 'x', type: 'staple', storage: 'pantry', trackAmount: false, createdAt: '', updatedAt: '' };
    expect(productSummaries(receipts, [spice]).find((p) => p.id === spice.id)?.trackAmount).toBe(false);
  });
  it('averages the price per unit weighted by quantity', () => {
    expect(averageUnitPrice({ purchases: [{ quantity: 1, paid: 4 }, { quantity: 3, paid: 6 }] } as never)).toBe(2.5);
  });
});

describe('packs', () => {
  it('only apply to pieces and to more than one', () => {
    expect(packSizeOf({ packSize: 6 }, 'pc')).toBe(6);
    expect(packSizeOf({ packSize: 6 }, 'kg')).toBeUndefined();
    expect(packSizeOf({ packSize: 1 }, 'pc')).toBeUndefined();
    expect(packSizeOf({ packSize: 0 }, 'pc')).toBeUndefined();
    expect(packSizeOf(undefined, 'pc')).toBeUndefined();
  });
  it('are carried into the product summary with their label', () => {
    const rec: FoodProduct = { id: 'fp-beer', name: 'Beer', type: 'drink', storage: 'pantry', packSize: 6, packLabel: 'can', createdAt: '', updatedAt: '' };
    const out = productSummaries([receipt({ lines: [line({ name: 'Beer', kind: 'alcohol' })] })], [rec]);
    expect(out[0]).toMatchObject({ packSize: 6, packLabel: 'can' });
  });
  it('pluralize the item name', () => {
    expect([pluralize('can', 1), pluralize('can', 12), pluralize('can', 0.5), pluralize('glass', 3), pluralize('bottle', 2)]).toEqual(['can', 'cans', 'cans', 'glasses', 'bottles']);
  });
  it('price one item from the pack price', () => {
    expect(pricePerItem(8.89, 6)).toBe(1.48);
    expect(pricePerItem(2.45, undefined)).toBe(2.45);
  });
});
