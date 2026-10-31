import { describe, expect, it } from 'vitest';
import type { DayWear } from '../clothes/calendar';
import type { ClothingItem, Outfit } from '../clothes/types';
import { checkinStreak, hourCounts, monthlyCounts, newVsRepeat, topCategories, topCities, topVenues, venueKey, weekdayCounts, wornOnDays } from './placeStats';
import type { Checkin } from './types';

let n = 0;
const ci = (venue: string, date: string, time = '12:00', extra: Partial<Checkin> = {}): Checkin => ({
  id: `swarm-${++n}`,
  venue,
  date,
  time,
  at: Date.parse(`${date}T${time}:00Z`) / 1000,
  source: 'swarm',
  createdAt: '',
  updatedAt: '',
  ...extra,
});

describe('venueKey', () => {
  it('prefers the venue id, else name + city', () => {
    expect(venueKey(ci('Café', '2026-01-01', '09:00', { venueId: 'v1' }))).toBe('v1');
    expect(venueKey(ci('Café', '2026-01-01', '09:00', { city: 'Paris' }))).toBe(venueKey(ci('café', '2026-02-01', '09:00', { city: 'paris' })));
  });
});

describe('topVenues', () => {
  const list = [ci('A', '2026-01-01'), ci('B', '2026-01-02'), ci('A', '2026-01-02'), ci('A', '2026-01-02', '18:00'), ci('B', '2025-05-05')];
  it('ranks by count with distinct days and first/last visit', () => {
    const [a, b] = topVenues(list);
    expect(a).toMatchObject({ name: 'A', count: 3, first: '2026-01-01', last: '2026-01-02', days: ['2026-01-01', '2026-01-02'] });
    expect(b.count).toBe(2);
  });
  it('limits to a period', () => {
    expect(topVenues(list, '2026').map((v) => v.count)).toEqual([3, 1]);
    expect(topVenues(list, '2025-05').map((v) => v.name)).toEqual(['B']);
  });
});

describe('categories and cities', () => {
  const list = [
    ci('A', '2026-01-01', '09:00', { category: 'Café', city: 'Paris', country: 'FR' }),
    ci('B', '2026-01-02', '09:00', { category: 'Café', city: 'Paris', country: 'FR' }),
    ci('C', '2026-01-03', '09:00', { category: 'Gym', city: 'Rome', country: 'IT' }),
    ci('D', '2026-01-03', '09:00'),
  ];
  it('counts, ignoring check-ins without the field', () => {
    expect(topCategories(list)).toEqual([
      { name: 'Café', count: 2 },
      { name: 'Gym', count: 1 },
    ]);
    expect(topCities(list)[0]).toEqual({ name: 'Paris', count: 2 });
  });
});

describe('monthlyCounts', () => {
  it('fills empty months and crosses the year boundary', () => {
    const rows = monthlyCounts([ci('A', '2025-12-03'), ci('A', '2026-02-01'), ci('A', '2026-02-09'), ci('A', '2020-01-01')], '2026-02', 3);
    expect(rows).toEqual([
      { month: '2025-12', count: 1 },
      { month: '2026-01', count: 0 },
      { month: '2026-02', count: 2 },
    ]);
  });
});

describe('weekdayCounts and hourCounts', () => {
  it('puts Monday first', () => {
    // 2026-10-05 is a Monday, 2026-10-11 a Sunday.
    const counts = weekdayCounts([ci('A', '2026-10-05'), ci('A', '2026-10-05'), ci('A', '2026-10-11')]);
    expect(counts[0]).toBe(2);
    expect(counts[6]).toBe(1);
  });
  it('bins by the hour stored on the check-in', () => {
    const h = hourCounts([ci('A', '2026-10-05', '08:15'), ci('A', '2026-10-05', '08:59'), ci('A', '2026-10-05', '23:00')]);
    expect(h[8]).toBe(2);
    expect(h[23]).toBe(1);
  });
});

describe('newVsRepeat', () => {
  it('counts places first visited in the period, and the rest as repeats', () => {
    const list = [ci('A', '2025-06-01'), ci('A', '2026-01-01'), ci('B', '2026-01-02'), ci('B', '2026-01-03')];
    expect(newVsRepeat(list, '2026')).toEqual({ newPlaces: 1, repeats: 2, total: 3 });
    expect(newVsRepeat(list)).toEqual({ newPlaces: 2, repeats: 2, total: 4 });
  });
});

describe('checkinStreak', () => {
  it('finds the longest run and the current one', () => {
    const list = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10', '2026-10-11'].map((d) => ci('A', d));
    expect(checkinStreak(list, '2026-10-11')).toEqual({ current: 2, longest: 3 });
    expect(checkinStreak(list, '2026-10-12').current).toBe(2); // yesterday still counts
    expect(checkinStreak(list, '2026-10-13').current).toBe(0);
  });
});

describe('wornOnDays', () => {
  const outfit = (id: string): Outfit => ({ id, name: id, itemIds: [], wears: [], createdAt: '', updatedAt: '' });
  const item = (id: string) => ({ id, name: id }) as ClothingItem;
  const wears = new Map<string, DayWear>([
    ['2026-01-01', { outfits: [outfit('o1')], items: [item('i1')] }],
    ['2026-01-02', { outfits: [outfit('o1'), outfit('o2')], items: [] }],
  ]);
  it('counts outfits and loose pieces on the given days, ignoring days with no wears', () => {
    const r = wornOnDays(['2026-01-01', '2026-01-02', '2026-01-03'], wears);
    expect(r.outfits.map((o) => [o.id, o.count])).toEqual([
      ['o1', 2],
      ['o2', 1],
    ]);
    expect(r.items).toEqual([{ id: 'i1', name: 'i1', count: 1 }]);
  });
});
