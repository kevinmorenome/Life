import { describe, expect, it } from 'vitest';
import type { WoltOrder } from './types';
import { parseShare } from './ShareEditor';
import { byDate, byService, hourCounts, monthlySpend, otherCurrencies, placeName, searchOrders, summarize, topPlaces } from './wolt';

const o = (id: string, restaurant: string, date: string, total: number, extra: Partial<WoltOrder> = {}): WoltOrder => ({
  id, restaurant, date, time: '20:15', total, currency: 'EUR', createdAt: '', updatedAt: '', ...extra,
});

const orders = [
  o('1', "McDonald's - Rotor", '2025-12-30', 9.5),
  o('2', "McDonald's - Jurišićeva", '2026-01-05', 19.1),
  o('3', 'Umami - Kajzerica', '2026-01-20', 33.5, { time: '12:05' }),
  o('4', 'Warsaw Burger', '2026-02-02', 100, { currency: 'PLN' }),
];

describe('placeName', () => {
  it('drops the branch', () => {
    expect(placeName("McDonald's - Rotor")).toBe("McDonald's");
    expect(placeName('Mainland Umami by Passata')).toBe('Mainland Umami by Passata');
    expect(placeName('Tao Of Ramen')).toBe('Tao Of Ramen');
  });
});

describe('summarize', () => {
  it('keeps other currencies out of the euro figures', () => {
    const s = summarize(orders, '2026');
    expect(s).toMatchObject({ orders: 4, euroOrders: 3, spent: 62.1, average: 20.7, since: '2025-12-30', yearOrders: 3, yearSpent: 52.6, topPlace: 'Umami' });
  });
  it('handles no orders', () => {
    expect(summarize([], '2026')).toMatchObject({ orders: 0, spent: 0, average: 0, since: undefined });
  });
});

describe('topPlaces', () => {
  it('combines branches and ranks by spend', () => {
    expect(topPlaces(orders)).toEqual([
      { name: 'Umami', orders: 1, spent: 33.5 },
      { name: "McDonald's", orders: 2, spent: 28.6 },
    ]);
  });
  it('limits to a period', () => {
    expect(topPlaces(orders, '2025').map((p) => p.name)).toEqual(["McDonald's"]);
  });
});

describe('monthlySpend', () => {
  it('fills months without orders', () => {
    expect(monthlySpend(orders, '2026-02')).toEqual([
      { month: '2025-12', spent: 9.5, orders: 1 },
      { month: '2026-01', spent: 52.6, orders: 2 },
      { month: '2026-02', spent: 0, orders: 0 },
    ]);
  });
  it('is empty without euro orders', () => expect(monthlySpend([orders[3]], '2026-03')).toEqual([]));
});

describe('hourCounts / otherCurrencies / byDate / search', () => {
  it('counts by hour', () => {
    const h = hourCounts(orders);
    expect(h[20]).toBe(3);
    expect(h[12]).toBe(1);
  });
  it('totals foreign orders', () => expect(otherCurrencies(orders)).toEqual([{ currency: 'PLN', orders: 1, total: 100 }]));
  it('groups by day', () => expect(byDate(orders).get('2026-01-05')).toHaveLength(1));
  it('searches name and date', () => {
    expect(searchOrders(orders, 'mcd').length).toBe(2);
    expect(searchOrders(orders, '2026-01 umami').length).toBe(1);
    expect(searchOrders(orders, 'january 2026').length).toBe(2);
    expect(searchOrders(orders, '').length).toBe(4);
  });
});

describe('byService', () => {
  it('counts per app, treating a missing service as Wolt', () => {
    const s = (id: string, service: 'bolt' | 'uber' | undefined, total: number) => o(id, 'X', '2026-05-01', total, { service });
    expect(byService([s('a', undefined, 10), s('b', 'bolt', 5), s('c', undefined, 20)])).toEqual([
      { service: 'wolt', orders: 2, spent: 30 },
      { service: 'bolt', orders: 1, spent: 5 },
    ]);
  });
});

describe('my share', () => {
  const shared = [o('1', 'Umami', '2026-01-20', 40, { myShare: 15 }), o('2', 'Umami', '2026-01-21', 20)];
  it('counts only what you paid in totals, places and months', () => {
    expect(summarize(shared, '2026')).toMatchObject({ spent: 35, average: 17.5, yearSpent: 35 });
    expect(topPlaces(shared)).toEqual([{ name: 'Umami', orders: 2, spent: 35 }]);
    expect(monthlySpend(shared, '2026-01')).toEqual([{ month: '2026-01', spent: 35, orders: 2 }]);
  });
  it('parses the typed amount', () => {
    expect(parseShare('', 40)).toBeUndefined();
    expect(parseShare('12,5', 40)).toBe(12.5);
    expect(parseShare('0', 40)).toBe(0);
    expect(parseShare('50', 40)).toBeNull();
    expect(parseShare('abc', 40)).toBeNull();
  });
});
