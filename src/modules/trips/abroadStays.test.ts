import { describe, expect, it } from 'vitest';
import { abroadStays, calendarTrips } from './abroadStays';
import type { Trip } from './types';

const ci = (date: string, country: string | undefined) => ({ date, country });

describe('abroadStays', () => {
  it('joins check-ins a few days apart in the same foreign country into one stay', () => {
    const list = [ci('2026-10-01', 'Mexico'), ci('2026-10-03', 'Mexico'), ci('2026-10-04', 'Mexico'), ci('2026-10-08', 'Mexico')];
    // 4 → 8 is four days, more than the gap allowed.
    expect(abroadStays(list, 'HR')).toEqual([
      { country: 'MX', startDate: '2026-10-01', endDate: '2026-10-04' },
      { country: 'MX', startDate: '2026-10-08', endDate: '2026-10-08' },
    ]);
  });

  it('ends a stay when you check in at home, or in another country', () => {
    const list = [ci('2026-10-01', 'Mexico'), ci('2026-10-02', 'Croatia'), ci('2026-10-03', 'Mexico'), ci('2026-10-04', 'Austria')];
    expect(abroadStays(list, 'HR').map((s) => [s.country, s.startDate, s.endDate])).toEqual([
      ['MX', '2026-10-01', '2026-10-01'],
      ['MX', '2026-10-03', '2026-10-03'],
      ['AT', '2026-10-04', '2026-10-04'],
    ]);
  });

  it('takes the country with most check-ins on a day, and ignores unknown places', () => {
    const list = [ci('2026-10-01', 'Austria'), ci('2026-10-01', 'Italy'), ci('2026-10-01', 'Italy'), ci('2026-10-02', 'Atlantis'), ci('2026-10-02', undefined)];
    expect(abroadStays(list, 'HR')).toEqual([{ country: 'IT', startDate: '2026-10-01', endDate: '2026-10-01' }]);
  });

  it('is nothing without a home country, or when everything is at home', () => {
    expect(abroadStays([ci('2026-10-01', 'Mexico')], undefined)).toEqual([]);
    expect(abroadStays([ci('2026-10-01', 'Croatia')], 'HR')).toEqual([]);
  });
});

describe('calendarTrips', () => {
  const trip = (over: Partial<Trip>): Trip => ({ id: 't1', name: 'Zadar', startDate: '2026-10-02', endDate: '2026-10-05', itemIds: [], extras: [], packed: [], createdAt: '', updatedAt: '', ...over });
  const stay = { country: 'MX', startDate: '2026-10-10', endDate: '2026-10-14' };

  it('adds stays as trips named after the country, after your own', () => {
    const [mine, added] = calendarTrips([trip({})], [stay]);
    expect(mine.id).toBe('t1');
    expect(added).toMatchObject({ id: 'stay-MX-2026-10-10', name: 'Mexico', country: 'MX', startDate: '2026-10-10', endDate: '2026-10-14' });
  });

  it('leaves out a stay that shares any day with a recorded trip', () => {
    expect(calendarTrips([trip({})], [{ country: 'MX', startDate: '2026-10-04', endDate: '2026-10-08' }])).toHaveLength(1);
  });
});
