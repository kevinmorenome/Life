import { describe, expect, it } from 'vitest';
import type { ProductSummary } from './products';
import { dayText, freshnessLevel, tileInfo } from './stockTiles';
import { stockOf } from './stock';
import { storagesInUse, type Entry } from './stockEntries';

const entry = (over: Partial<ProductSummary>, bought = '2026-10-31', qty = 1): Entry => {
  const product: ProductSummary = { id: 'fp-x', name: 'Thing', kind: 'food', unit: 'pc', type: 'staple', storage: 'pantry', hasPhoto: false, custom: false, purchases: [{ batch: 'r:0', receiptId: 'r', date: bought, store: 'K', quantity: qty, unit: 'pc', unitPrice: 1, paid: qty }], ...over };
  return { product, stock: stockOf(product, product.purchases, [], '2026-11-02') };
};

describe('freshness words', () => {
  it('says days in words and flags past dates', () => {
    expect([-2, 0, 1, 2, 12].map(dayText)).toEqual(['Past date', 'Today', '1 day', '2 days', '12 days']);
  });
  it('is urgent at a day or less, soon at three', () => {
    expect([-1, 0, 1, 2, 3, 4].map(freshnessLevel)).toEqual(['urgent', 'urgent', 'urgent', 'soon', 'soon', 'ok']);
  });
});

describe('tileInfo for what is used up', () => {
  it('says Out, sorts after everything you have and drops the pill and bar', () => {
    const gone = { ...entry({ type: 'fresh', shelfLifeDays: 2 }), stock: stockOf({ type: 'fresh', shelfLifeDays: 2 }, [{ date: '2026-10-31', quantity: 1 }], [{ id: 'e', productId: 'fp-x', type: 'count', quantity: 0, date: '2026-11-01', source: 'app', createdAt: 'a', updatedAt: 'a' }], '2026-11-02') };
    expect(tileInfo(gone, '2026-11-02')).toEqual({ badge: 'Out', label: 'Thing, used up', sortKey: 2000 });
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
});

describe('thawed food on the grid', () => {
  const ev = (type: 'freeze' | 'thaw', batch: string, date: string, id: string) => ({ id, productId: 'fp-x', type, quantity: 1, date, source: 'app' as const, batch, createdAt: `${date}T10:00:00Z`, updatedAt: '' });
  const make = (type: 'staple' | 'fresh') => {
    const e = entry({ type, name: 'Chicken' }, '2026-10-20');
    const stock = stockOf(e.product, e.product.purchases, [ev('freeze', 'r:0', '2026-10-21', 'f'), ev('thaw', 'freeze-f:r:0', '2026-11-02', 't')], '2026-11-02');
    return { ...e, stock };
  };

  it('is marked and said in words, whatever the type', () => {
    for (const type of ['staple', 'fresh'] as const) {
      const info = tileInfo(make(type), '2026-11-02');
      expect(info.pill).toEqual({ text: 'Thawed · 2 days', level: 'soon' });
      expect(info.label).toContain('thawed');
    }
    expect(tileInfo(make('staple'), '2026-11-04').pill).toEqual({ text: 'Thawed · Today', level: 'urgent' });
    expect(tileInfo(make('staple'), '2026-11-05').pill?.text).toBe('Thawed · past date');
  });

  it('goes before everything else', () => {
    const soonest = entry({ type: 'fresh', shelfLifeDays: 1 }, '2026-11-02');
    expect(tileInfo(make('staple'), '2026-11-02').sortKey).toBeLessThan(tileInfo(soonest, '2026-11-02').sortKey);
  });
});

describe('the places offered by the stock filter', () => {
  it('lists only places with something, in the usual order, frozen food under the freezer', () => {
    const home = entry({ id: 'fp-a', storage: 'home' });
    const fridge = entry({ id: 'fp-b', storage: 'fridge', type: 'fresh' });
    const gone = entry({ id: 'fp-c', storage: 'pantry' }, '2026-10-31', 0);
    expect(storagesInUse([home, fridge, gone])).toEqual(['fridge', 'pantry', 'home']);
    expect(storagesInUse([])).toEqual([]);
    const frozen = entry({ id: 'fp-d', storage: 'fridge', type: 'fresh' }, '2026-10-20');
    const ev = { id: 'f', productId: 'fp-d', type: 'freeze' as const, quantity: 1, date: '2026-10-21', source: 'app' as const, batch: 'r:0', createdAt: '2026-10-21T10:00:00Z', updatedAt: '' };
    expect(storagesInUse([{ ...frozen, stock: stockOf(frozen.product, frozen.product.purchases, [ev], '2026-11-02') }])).toEqual(['freezer']);
  });
});
