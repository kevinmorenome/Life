import { describe, expect, it } from 'vitest';
import type { Ride } from './types';
import { byDate, hourCounts, monthlySpend, otherCurrencies, placeLabel, searchRides, summarize, topPlaces, weekdayCounts } from './rides';

const r = (id: string, provider: Ride['provider'], date: string, fare: number, extra: Partial<Ride> = {}): Ride => ({
  id, provider, date, time: '20:15', fare, currency: 'EUR', createdAt: '', updatedAt: '', ...extra,
});

const rides = [
  r('1', 'bolt', '2025-12-30', 6.5, { to: 'Ilica 12, Zagreb', distanceKm: 4.2 }),
  r('2', 'uber', '2026-01-05', 12, { from: 'Ilica 12, Zagreb', to: 'Airport, Velika Gorica', distanceKm: 15 }),
  r('3', 'bolt', '2026-01-20', 8, { time: '08:05', to: 'ilica 12' }),
  r('4', 'bolt', '2026-03-02', 100, { currency: 'PLN', to: 'Warsaw' }),
];

describe('rides', () => {
  it('shortens addresses', () => {
    expect(placeLabel('Ilica 12, Zagreb')).toBe('Ilica 12');
    expect(placeLabel(' ')).toBeUndefined();
    expect(placeLabel(undefined)).toBeUndefined();
  });
  it('summarizes euro rides and splits by provider', () => {
    const s = summarize(rides, '2026');
    expect(s).toMatchObject({ rides: 4, euroRides: 3, spent: 26.5, average: 8.83, since: '2025-12-30', yearRides: 3, yearSpent: 20, km: 19.2 });
    expect(s.byProvider).toEqual([
      { provider: 'bolt', rides: 3, spent: 14.5 },
      { provider: 'uber', rides: 1, spent: 12 },
    ]);
  });
  it('fills empty months and ignores other currencies', () => {
    expect(monthlySpend(rides, '2026-02')).toEqual([
      { month: '2025-12', spent: 6.5, rides: 1 },
      { month: '2026-01', spent: 20, rides: 2 },
      { month: '2026-02', spent: 0, rides: 0 },
    ]);
    expect(monthlySpend([], '2026-02')).toEqual([]);
  });
  it('counts hours and weekdays', () => {
    const h = hourCounts([...rides, r('5', 'uber', '2026-01-06', 1, { time: undefined })]);
    expect(h[20]).toBe(3);
    expect(h[8]).toBe(1);
    expect(weekdayCounts([r('a', 'bolt', '2026-11-02', 1), r('b', 'bolt', '2026-11-08', 1)])).toEqual([1, 0, 0, 0, 0, 0, 1]);
  });
  it('ranks places case-insensitively', () => {
    expect(topPlaces(rides, 'to')[0]).toEqual({ name: 'Ilica 12', rides: 2 });
    expect(topPlaces(rides, 'from')).toEqual([{ name: 'Ilica 12', rides: 1 }]);
  });
  it('reports other currencies', () => expect(otherCurrencies(rides)).toEqual([{ currency: 'PLN', rides: 1, total: 100 }]));
  it('groups by date, oldest first', () => {
    expect(byDate([rides[2], r('x', 'uber', '2026-01-20', 3, { time: '07:00' })]).get('2026-01-20')!.map((x) => x.id)).toEqual(['x', '3']);
  });
  it('searches provider and address', () => {
    expect(searchRides(rides, 'uber airport').map((x) => x.id)).toEqual(['2']);
    expect(searchRides(rides, '').length).toBe(4);
  });
});
