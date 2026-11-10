import { describe, expect, it } from 'vitest';
import type { Checkin } from './types';
import { longestRun, reviewYears, yearReview } from './yearReview';

let n = 0;
const ci = (venue: string, date: string, extra: Partial<Checkin> = {}): Checkin => ({
  id: `c${++n}`,
  venue,
  date,
  time: '12:00',
  at: Date.parse(`${date}T12:00:00Z`) / 1000,
  source: 'swarm',
  createdAt: '',
  updatedAt: '',
  ...extra,
});

const list = [
  ci('Cafe', '2025-03-01', { country: 'Croatia', city: 'Zagreb', category: 'Coffee' }),
  ci('Cafe', '2026-03-02', { country: 'Croatia', city: 'Zagreb', category: 'Coffee' }),
  ci('Cafe', '2026-03-03', { country: 'Croatia', city: 'Zagreb', category: 'Coffee' }),
  ci('Cafe', '2026-03-03', { country: 'Croatia', city: 'Zagreb', category: 'Coffee' }),
  ci('Park', '2026-03-04', { country: 'Croatia', city: 'Zagreb', category: 'Park' }),
  ci('Museum', '2026-07-10', { country: 'Austria', city: 'Vienna', category: 'Museum' }),
  ci('Pub', '2026-07-11', { country: 'Austria', city: 'Vienna', category: 'Bar' }),
];

describe('reviewYears', () => {
  it('lists years that have check-ins or wears, newest first', () => {
    expect(reviewYears(list)).toEqual(['2026', '2025']);
    expect(reviewYears([], [{ id: 'a', wears: ['2024-05-05', '2026-01-01'] }])).toEqual(['2026', '2024']);
    expect(reviewYears([])).toEqual([]);
  });
});

describe('longestRun', () => {
  it('finds the longest run of consecutive days, the earliest on a tie', () => {
    expect(longestRun(['2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07'])).toEqual({ days: 3, start: '2026-01-05', end: '2026-01-07' });
    expect(longestRun(['2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06'])).toEqual({ days: 2, start: '2026-01-01', end: '2026-01-02' });
    expect(longestRun([])).toEqual({ days: 0 });
    expect(longestRun(['2026-12-31', '2027-01-01'])).toMatchObject({ days: 2 });
  });
});

describe('yearReview', () => {
  const r = yearReview(
    list,
    '2026',
    [
      { id: 'p1', name: 'White tee', wears: ['2026-01-01', '2026-01-02', '2026-01-02', '2025-12-31'] },
      { id: 'p2', name: 'Blazer', wears: ['2026-05-05'] },
      { id: 'p3', name: 'Last year only', wears: ['2025-01-01'] },
    ],
    [{ id: 'o1', name: 'Work look', wears: ['2026-02-02', '2026-02-03'] }],
  );

  it('counts the year only', () => {
    expect(r).toMatchObject({ year: '2026', checkins: 6, places: 4, daysOut: 5, newPlaces: 3 });
  });
  it('ranks places, kinds and cities', () => {
    expect(r.topVenues[0]).toMatchObject({ name: 'Cafe', count: 3 });
    expect(r.categories[0]).toEqual({ name: 'Coffee', count: 3 });
    expect(r.cities).toEqual([{ name: 'Zagreb', count: 4 }, { name: 'Vienna', count: 2 }]);
  });
  it('lists countries and the ones first reached this year', () => {
    expect(r.countries).toEqual(['Austria', 'Croatia']);
    expect(r.newCountries).toEqual(['Austria']);
  });
  it('finds the busiest month and day and the longest streak', () => {
    expect(r.busiestMonth).toEqual({ month: '2026-03', count: 4 });
    expect(r.busiestDay).toEqual({ date: '2026-03-03', count: 2 });
    expect(r.longestStreak).toEqual({ days: 3, start: '2026-03-02', end: '2026-03-04' });
  });
  it('ranks what was worn this year, counting a day once and skipping other years', () => {
    expect(r.mostWornPieces).toEqual([{ id: 'p1', name: 'White tee', count: 2 }, { id: 'p2', name: 'Blazer', count: 1 }]);
    expect(r.mostWornOutfits).toEqual([{ id: 'o1', name: 'Work look', count: 2 }]);
  });
  it('is empty for a year with nothing', () => {
    expect(yearReview(list, '2020')).toMatchObject({ checkins: 0, places: 0, busiestMonth: undefined, longestStreak: { days: 0 } });
  });
});
