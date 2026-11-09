import { describe, expect, it } from 'vitest';
import { batchesOldestFirst, dateWarning, purchaseDateOf } from './batches';
import type { ProductSummary } from './products';
import { stockOf } from './stock';
import type { Entry } from './stockEntries';
import type { StockEvent } from './types';

const entry = (events: StockEvent[] = []): Entry => {
  const product: ProductSummary = {
    id: 'fp-chicken', name: 'Chicken breast', kind: 'food', unit: 'pc', type: 'fresh', storage: 'fridge', hasPhoto: false, custom: false,
    purchases: [['2026-11-09', 2], ['2026-11-02', 1]].map(([date, quantity], i) => ({ batch: `r:${i}`, receiptId: 'r', date: date as string, store: 'K', quantity: quantity as number, unit: 'pc' as const, unitPrice: 1, paid: 1 })),
  };
  return { product, stock: stockOf(product, product.purchases, events, '2026-11-11') };
};

describe('batchesOldestFirst', () => {
  it('lists the oldest purchase first, whatever order the receipts are in or when each expires', () => {
    const expiry: StockEvent = { id: 'x', productId: 'fp-chicken', type: 'expiry', quantity: 0, date: '2026-11-09', source: 'app', batch: 'r:0', useBy: '2026-11-10', createdAt: '2026-11-09T10:00:00Z', updatedAt: '' };
    const e = entry([expiry]);
    expect(batchesOldestFirst(e).map((b) => purchaseDateOf(e, b))).toEqual(['2026-11-02', '2026-11-09']);
  });
});

describe('dateWarning', () => {
  const e = entry();
  const count = (date: string, batch?: string): StockEvent => ({ id: `c${date}`, productId: 'fp-chicken', type: 'count', quantity: 1, date, source: 'app', ...(batch ? { batch } : {}), createdAt: `${date}T10:00:00Z`, updatedAt: '' });
  it('is quiet for an ordinary day', () => {
    expect(dateWarning('2026-11-10', [], e.product, e.stock.batches[0])).toBeUndefined();
  });
  it('warns when a newer count covers the day', () => {
    expect(dateWarning('2026-11-05', [count('2026-11-08')], e.product)).toMatch(/already covers it/);
    // A count of another batch does not cover this one.
    const first = batchesOldestFirst(e)[0];
    expect(dateWarning('2026-11-05', [count('2026-11-08', 'r:0')], e.product, first)).toBeUndefined();
  });
  it('warns when the batch was bought after the day', () => {
    const newer = batchesOldestFirst(e)[1];
    expect(dateWarning('2026-11-05', [], e.product, newer)).toMatch(/bought on/);
  });
});
