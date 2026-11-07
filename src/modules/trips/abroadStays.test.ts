import { describe, expect, it } from 'vitest';
import { makeAwayOf } from '../countries/countries';
import { abroadStays, calendarTrips, withoutHidden } from './abroadStays';
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

describe('withoutHidden', () => {
  const stays = [
    { country: 'MX', startDate: '2026-10-10', endDate: '2026-10-14' },
    { country: 'AT', startDate: '2026-10-20', endDate: '2026-10-22' },
  ];
  it('drops stays that share a day with a suggestion you hid', () => {
    expect(withoutHidden(stays, [{ startDate: '2026-10-13', endDate: '2026-10-16' }])).toEqual([stays[1]]);
  });
  it('keeps everything when nothing is hidden', () => {
    expect(withoutHidden(stays, [])).toEqual(stays);
  });
});

describe('abroadStays with a home that changes', () => {
  it('counts a country as home only in the period it was home', () => {
    const c = [
      { date: '2023-05-01', country: 'Mexico' },
      { date: '2023-08-01', country: 'Mexico' },
      { date: '2023-08-03', country: 'Mexico' },
    ];
    const home = (d: string) => (d < '2023-07-01' ? 'MX' : 'HR');
    expect(abroadStays(c, home).map((s) => [s.country, s.startDate, s.endDate])).toEqual([['MX', '2023-08-01', '2023-08-03']]);
  });
});

describe('abroadStays with a home city', () => {
  const place = () => ({ country: 'HR', city: 'Zagreb' });
  const away = (c: Parameters<typeof makeAwayOf>[1]) => makeAwayOf(place, c);
  const c = [
    { date: '2026-05-01', country: 'Croatia', city: 'Zagreb' },
    { date: '2026-05-02', country: 'Croatia', city: 'Split' },
    { date: '2026-05-03', country: 'Croatia', city: 'Split' },
    { date: '2026-05-04', country: 'Croatia', city: 'Zagreb' },
    { date: '2026-05-05', country: 'Croatia', city: 'Velika Gorica', category: 'Airport', venue: 'Zagreb Airport' },
  ];
  it('counts another city of the home country as a stay, ended by a day at home', () => {
    expect(abroadStays(c, 'HR', 3, away(c)).map((s) => [s.country, s.startDate, s.endDate])).toEqual([['HR', '2026-05-02', '2026-05-03']]);
  });
  it('is no stay at all when home is the country', () => {
    expect(abroadStays(c, 'HR')).toEqual([]);
  });
  it('needs two days in a town near home, but one is enough far away', () => {
    const near = [{ date: '2026-05-02', country: 'Croatia', city: 'Samobor' }];
    expect(abroadStays(near, 'HR', 3, away(near))).toEqual([]);
    const far = [
      { date: '2026-05-01', country: 'Croatia', city: 'Zagreb', lat: 45.81, lng: 15.98 },
      { date: '2026-05-02', country: 'Croatia', city: 'Split', lat: 43.51, lng: 16.44 },
    ];
    expect(abroadStays(far, 'HR', 3, away(far)).map((s) => s.startDate)).toEqual(['2026-05-02']);
  });
  it('does not count a check-in with no city that is in the home city', () => {
    const c = [
      { date: '2026-05-01', country: 'Croatia', city: 'Zagreb', lat: 45.81, lng: 15.98 },
      { date: '2026-09-06', country: 'Croatia', lat: 45.8, lng: 15.99 },
      { date: '2026-09-07', country: 'Croatia' },
    ];
    expect(abroadStays(c, 'HR', 3, away(c))).toEqual([]);
  });
});
