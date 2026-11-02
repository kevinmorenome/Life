import { describe, expect, it } from 'vitest';
import type { ProductSummary } from './products';
import { dayText, freshnessLevel, tileInfo } from './stockTiles';
import { stockOf } from './stock';
import type { Entry } from './stockEntries';

const entry = (over: Partial<ProductSummary>, bought = '2026-10-31', qty = 1): Entry => {
  const product: ProductSummary = { id: 'fp-x', name: 'Thing', kind: 'food', unit: 'pc', type: 'staple', storage: 'pantry', trackAmount: true, custom: false, purchases: [{ receiptId: 'r', date: bought, store: 'K', quantity: qty, unit: 'pc', unitPrice: 1, paid: qty }], ...over };
  return { product, stock: stockOf(product, product.purchases, [], '2026-11-02'), uses: 0 };
};

describe('freshness words', () => {
  it('says days in words and flags past dates', () => {
    expect([-2, 0, 1, 2, 12].map(dayText)).toEqual(['Past date', 'Today', '1 day', '2 days', '12 days']);
  });
  it('is urgent at a day or less, soon at three', () => {
    expect([-1, 0, 1, 2, 3, 4].map(freshnessLevel)).toEqual(['urgent', 'urgent', 'urgent', 'soon', 'soon', 'ok']);
  });
});

describe('tileInfo', () => {
  it('shows a plain count with no pill or bar for staples', () => {
    expect(tileInfo(entry({}), '2026-11-02')).toEqual({ badge: '1', label: 'Thing, 1', sortKey: 1000 });
  });
  it('names the unit for weighed goods and reads packs as items', () => {
    const chicken = entry({ unit: 'kg', type: 'fresh', name: 'Chicken', shelfLifeDays: 2 }, '2026-10-31', 0.908);
    expect(tileInfo(chicken, '2026-11-02')).toMatchObject({ badge: '0.91 kg', label: 'Chicken, 0.91 kg' });
    const beer = entry({ type: 'drink', name: 'Beer', packSize: 6, packLabel: 'can' }, '2026-10-31', 2);
    expect(tileInfo(beer, '2026-11-02')).toMatchObject({ badge: '12', label: 'Beer, 12 cans' });
  });
  it('shows quarters for part-used packs', () => {
    const half = entry({}, '2026-10-31', 1.5);
    expect(tileInfo(half, '2026-11-02').badge).toBe('1½');
  });
  it('gives fresh items a pill when 3 days or less are left, and always a bar', () => {
    const today = tileInfo(entry({ type: 'fresh', shelfLifeDays: 2 }), '2026-11-02');
    expect(today.pill).toEqual({ text: 'Today', level: 'urgent' });
    expect(today.sortKey).toBe(0);
    const plenty = tileInfo(entry({ type: 'fresh', shelfLifeDays: 14 }), '2026-11-02');
    expect(plenty.pill).toBeUndefined();
    expect(plenty.bar).toEqual({ pct: 86, level: 'ok' });
  });
  it('shows "Past date" and keeps a small bar when it is past its date', () => {
    const old = tileInfo(entry({ type: 'fresh', shelfLifeDays: 2 }, '2026-10-25'), '2026-11-02');
    expect(old.pill).toEqual({ text: 'Past date', level: 'urgent' });
    expect(old.bar?.pct).toBe(6);
  });
  it('says Have for products with no amount', () => {
    const oil = entry({ trackAmount: false });
    expect(tileInfo(oil, '2026-11-02')).toMatchObject({ badge: 'Have', label: 'Thing, have it' });
  });
});
