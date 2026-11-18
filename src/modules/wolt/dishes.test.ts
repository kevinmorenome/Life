import { describe, expect, it } from 'vitest';
import { dishKey, dishLines, feesOf, filterLines, itemSpendPerMonth, latestFeedback, priceTrend, repeatPrices, topDishes, topVenues, unratedDishes } from './dishes';
import type { TakeoutDetail, WoltOrder } from './types';

const order = (id: string, restaurant: string, date: string, total: number, currency = 'EUR'): WoltOrder => ({ id, restaurant, date, total, currency, createdAt: '', updatedAt: '' });
const detail = (orderId: string, items: [string, number, number][]): TakeoutDetail => ({
  id: `td-${orderId}`, orderId, createdAt: '', updatedAt: '',
  items: items.map(([name, qty, unit]) => ({ name, qty, unitPrice: unit, linePrice: qty * unit, vat: 13 })),
  itemsSubtotal: items.reduce((s, [, q, u]) => s + q * u, 0),
});
const orders = [order('wolt-1', 'Tian Tan', '2026-09-01', 30), order('wolt-2', "Tian Tan - Ilica", '2026-10-01', 25), order('wolt-3', 'Pizza Blue', '2026-10-05', 12), order('wolt-4', 'Warsaw Bar', '2026-10-06', 50, 'PLN')];
const details = [
  detail('wolt-1', [['Pohana piletina', 2, 10], ['Juha', 1, 3]]),
  detail('wolt-2', [['Pohana  piletina', 1, 11], ['Juha', 1, 3]]),
  detail('wolt-3', [['Margherita', 1, 9]]),
  detail('wolt-4', [['Pierogi', 2, 20]]),
];

describe('dishes', () => {
  const lines = dishLines(orders, details);
  it('keys ignore case, spacing and branch', () => expect(dishKey('Tian Tan - Ilica', 'Pohana  Piletina')).toBe(dishKey('Tian Tan', 'pohana piletina')));
  it('flattens newest first and keeps the raw name', () => {
    expect(lines).toHaveLength(6);
    expect(lines[0].raw).toBe('Pierogi');
  });
  it('ranks dishes by count and by spend, euro only for spend', () => {
    expect(topDishes(lines)[0]).toMatchObject({ dish: 'Pohana piletina', count: 3, orders: 2, spent: 31 });
    expect(topDishes(lines, 'spend')[0].dish).toBe('Pohana piletina');
    expect(topDishes(lines).find((d) => d.dish === 'Pierogi')).toMatchObject({ count: 2, spent: 0 });
  });
  it('uses your group names without touching the raw name', () => {
    const g = dishLines(orders, details, [{ key: dishKey('Tian Tan', 'Juha'), group: 'Soup' }]);
    expect(g.find((l) => l.raw === 'Juha')!.dish).toBe('Soup');
    expect(topDishes(g).find((d) => d.dish === 'Soup')!.count).toBe(2);
  });
  it('ranks venues with branches combined', () => expect(topVenues(lines)[0]).toMatchObject({ venue: 'Tian Tan', orders: 2, topDish: 'Pohana piletina' }));
  it('filters by venue, words, accents and dates', () => {
    expect(filterLines(lines, { venue: 'tian' })).toHaveLength(4);
    expect(filterLines(lines, { query: 'POHANA' })).toHaveLength(2);
    expect(filterLines(lines, { from: '2026-10-02' })).toHaveLength(2);
  });
  it('tracks price changes of repeat items', () => {
    expect(priceTrend(lines, 'pohana piletina').map((p) => p.unitPrice)).toEqual([10, 11]);
    expect(repeatPrices(lines, 2)).toEqual([{ dish: 'Pohana piletina', times: 2, first: 10, latest: 11, change: 1 }]);
  });
  it('sums item spend per month with empty months', () => expect(itemSpendPerMonth(lines, '2026-11')).toEqual([{ month: '2026-09', spent: 23 }, { month: '2026-10', spent: 23 }, { month: '2026-11', spent: 0 }]));
  it('shows fees and other as the difference', () => expect(feesOf(orders[0], details[0])).toEqual({ items: 23, fees: 7 }));
  it('finds dishes without a like, newest verdict wins', () => {
    const fb = latestFeedback([
      { key: dishKey('Tian Tan', 'Juha'), verdict: 'disliked', at: '2026-10-02T10:00:00Z' },
      { key: dishKey('Tian Tan', 'Juha'), verdict: 'liked', at: '2026-10-03T10:00:00Z' },
    ]);
    expect(fb.get(dishKey('Tian Tan', 'Juha'))!.verdict).toBe('liked');
    const un = unratedDishes(lines, fb, '2026-10-01');
    expect(un.map((u) => u.raw)).toEqual(['Pierogi', 'Margherita', 'Pohana  piletina']);
  });
});

describe('mergeFeedback', () => {
  it('keeps the verdict when only a note is given, and the note when only a verdict is', async () => {
    const { mergeFeedback } = await import('./dishes');
    expect(mergeFeedback({ verdict: 'liked' }, { note: ' less sauce ' })).toEqual({ verdict: 'liked', note: 'less sauce' });
    expect(mergeFeedback({ verdict: 'liked', note: 'x' }, { verdict: 'disliked' })).toEqual({ verdict: 'disliked', note: 'x' });
    expect(mergeFeedback({ verdict: 'liked', note: 'x' }, { verdict: null })).toEqual({ note: 'x' });
    expect(mergeFeedback({ verdict: 'liked', note: 'x' }, { note: '' })).toEqual({ verdict: 'liked' });
  });
});

describe('shares: items that were for someone else', () => {
  const orders = [order('wolt-1', 'Tian Tan', '2026-09-01', 30)];
  const details = [detail('wolt-1', [['Pohana piletina', 2, 10], ['Juha', 1, 3]])];
  it('counts only your part and drops lines that are all someone else’s', async () => {
    const { latestShares } = await import('./dishes');
    const shares = latestShares([{ orderId: 'wolt-1', mine: { '0': 1, '1': 0 }, at: '2026-09-02T00:00:00Z' }]);
    const l = dishLines(orders, details, [], shares);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ raw: 'Pohana piletina', qty: 1, linePrice: 10 });
    expect(topDishes(l)[0]).toMatchObject({ count: 1, spent: 10 });
  });
  it('the newest share wins whole, and no share means all yours', async () => {
    const { latestShares } = await import('./dishes');
    const s = latestShares([{ orderId: 'wolt-1', mine: { '1': 0 }, at: '2026-09-02T00:00:00Z' }, { orderId: 'wolt-1', mine: {}, at: '2026-09-03T00:00:00Z' }]);
    expect(dishLines(orders, details, [], s)).toHaveLength(2);
    expect(dishLines(orders, details)).toHaveLength(2);
  });
});
