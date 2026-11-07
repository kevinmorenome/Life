import { describe, expect, it } from 'vitest';
import { parseWoltOrders } from './wolt';

describe('parseWoltOrders', () => {
  it('validates, defaults the currency and drops duplicates', () => {
    const { orders, rejected } = parseWoltOrders(
      [
        { sourceId: 'abc 1', restaurant: " McDonald's - Rotor ", date: '2026-05-03', time: '22:36', total: 9.614, currency: 'eur' },
        { sourceId: 'abc1', restaurant: 'dup', date: '2026-05-03', total: 1 },
        { sourceId: 'p1', restaurant: 'Warsaw', date: '2026-04-01', time: '25:00', total: 50, currency: 'PLN' },
        { sourceId: 'bad', restaurant: 'X', date: '2026-02-31', total: 5 },
        { sourceId: 'future', restaurant: 'X', date: '2027-01-01', total: 5 },
        'nope',
      ],
      '2026-11-02',
    );
    expect(orders).toEqual([
      { id: 'wolt-abc1', restaurant: "McDonald's - Rotor", date: '2026-05-03', time: '22:36', total: 9.61, currency: 'EUR', city: undefined },
      { id: 'wolt-p1', restaurant: 'Warsaw', date: '2026-04-01', time: undefined, total: 50, currency: 'PLN', city: undefined },
    ]);
    expect(rejected).toHaveLength(3);
  });
  it('prefixes ids and records the service for Bolt and Uber', () => {
    const { orders } = parseWoltOrders([{ sourceId: 'a1', restaurant: 'Pizza', date: '2026-05-03', total: 5 }], '2026-11-02', 'uber');
    expect(orders[0]).toMatchObject({ id: 'uber-a1', service: 'uber' });
  });
  it('ignores non-arrays', () => expect(parseWoltOrders('x', '2026-11-02')).toEqual({ orders: [], rejected: [] }));
});
