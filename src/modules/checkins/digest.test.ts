import { describe, expect, it } from 'vitest';
import type { DayInfo } from '../work/work';
import { buildDigest, datesBetween } from './digest';
import type { PlaceCheckin } from './placesQuery';

let n = 0;
const ci = (venue: string, date: string, extra: Partial<PlaceCheckin> = {}): PlaceCheckin => ({ id: `c${++n}`, venue, date, time: '12:00', source: 'swarm', ...extra });

const checkins = [
  ci('Cafe', '2026-10-19', { city: 'Zagreb', country: 'Croatia' }),
  ci('Cafe', '2026-10-21', { city: 'Zagreb', country: 'Croatia' }),
  ci('Park', '2026-10-21', { city: 'Zagreb', country: 'Croatia' }),
  ci('Museum', '2026-10-23', { city: 'Vienna', country: 'Austria', category: 'Museum' }),
  ci('Cafe', '2026-10-12', { city: 'Zagreb', country: 'Croatia' }),
  ci('Cafe', '2026-10-30'),
];
const worn = new Map([
  ['2026-10-19', { outfits: ['Work look'], items: [] }],
  ['2026-10-21', { outfits: ['Work look'], items: ['Red scarf'] }],
  ['2026-10-22', { outfits: [], items: [] }],
]);
const info = (status: DayInfo['status'], arrive?: string, leave?: string): DayInfo => ({ status, manual: false, arrive, leave });
const days = new Map<string, DayInfo>([
  ['2026-10-19', info('office', '09:00', '17:30')],
  ['2026-10-20', info('office', '08:00', '16:00')],
  ['2026-10-21', info('home')],
  ['2026-10-22', info('trip')],
  ['2026-10-23', info('off')],
  ['2026-10-12', info('office')],
]);

describe('datesBetween', () => {
  it('lists every day inclusive, and nothing when the end is first', () => {
    expect(datesBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(datesBetween('2026-10-02', '2026-10-01')).toEqual([]);
  });
});

describe('buildDigest', () => {
  const d = buildDigest({ checkins, worn, days, start: '2026-10-19', end: '2026-10-25' });

  it('summarises places in the period and against the one before', () => {
    expect(d.period).toEqual({ start: '2026-10-19', end: '2026-10-25', days: 7 });
    expect(d.places).toMatchObject({ checkins: 4, previousCheckins: 1, distinctPlaces: 3, daysOut: 3, cities: ['Zagreb', 'Vienna'], countries: ['Croatia', 'Austria'] });
    expect(d.places.topPlaces[0]).toEqual({ name: 'Cafe', city: 'Zagreb', visits: 2 });
  });

  it('counts a place as new only when its first check-in ever is in the period', () => {
    expect(d.places.newPlaces.map((p) => p.name)).toEqual(['Park', 'Museum']);
  });

  it('counts what was worn and the days nothing was logged', () => {
    expect(d.outfits.daysLogged).toBe(2);
    expect(d.outfits.outfits).toEqual([{ name: 'Work look', times: 2 }]);
    expect(d.outfits.loosePieces).toEqual([{ name: 'Red scarf', times: 1 }]);
    expect(d.outfits.notLogged).toEqual(['2026-10-20', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  });

  it('counts work days by status and averages the time at the office', () => {
    expect(d.work).toMatchObject({ officeDays: 2, homeDays: 1, tripDays: 1, offDays: 1, previousOfficeDays: 1, averageAtOffice: '8h 15m' });
  });

  it('has no average without times, and copes with nothing at all', () => {
    const empty = buildDigest({ checkins: [], worn: new Map(), days: new Map(), start: '2026-10-19', end: '2026-10-19' });
    expect(empty.places).toMatchObject({ checkins: 0, newPlaces: [], topPlaces: [] });
    expect(empty.work.averageAtOffice).toBeUndefined();
    expect(empty.outfits.notLogged).toEqual(['2026-10-19']);
  });
});

describe('buildDigest: other modules', () => {
  const base = { checkins: [], worn: new Map(), days: new Map(), start: '2026-10-19', end: '2026-10-25' };

  it('leaves out modules with nothing in the period', () => {
    expect(buildDigest(base).other).toEqual({});
    expect(buildDigest({ ...base, takeout: [{ date: '2026-10-01', place: 'X', total: 5, currency: 'EUR' }] }).other).toEqual({});
  });

  it('sums takeout and rides in euro, counts other currencies apart and joins branches', () => {
    const d = buildDigest({
      ...base,
      takeout: [
        { date: '2026-10-20', place: "McDonald's - Rotor", total: 10.5, currency: 'EUR' },
        { date: '2026-10-21', place: "McDonald's - Ilica", total: 9.5, currency: 'EUR' },
        { date: '2026-10-22', place: 'Zabka', total: 40, currency: 'PLN' },
      ],
      rides: [{ date: '2026-10-23', fare: 7.4, currency: 'EUR' }, { date: '2026-10-24', fare: 30, currency: 'PLN' }],
    });
    expect(d.other.takeout).toEqual({ orders: 3, spentEur: 20, otherCurrencyOrders: 1, places: [{ name: "McDonald's", times: 2 }, { name: 'Zabka', times: 1 }] });
    expect(d.other.rides).toEqual({ rides: 2, spentEur: 7.4, otherCurrencyRides: 1 });
  });

  it('summarises groceries, watching, music and games', () => {
    const d = buildDigest({
      ...base,
      groceries: [{ date: '2026-10-19', store: 'Konzum', total: 31.2 }, { date: '2026-10-24', store: 'dm', total: 8.8 }, { date: '2026-10-24', store: 'Konzum', total: 10 }],
      watched: [
        { date: '2026-10-20', title: 'Severance', kind: 'episode' },
        { date: '2026-10-21', title: 'Severance', kind: 'episode' },
        { date: '2026-10-22', title: 'Heat', kind: 'movie' },
      ],
      music: [
        { date: '2026-10-19', plays: 40, ms: 5_400_000, artists: [{ name: 'A', plays: 10 }, { name: 'B', plays: 5 }] },
        { date: '2026-10-20', plays: 0, ms: 0 },
        { date: '2026-10-21', plays: 20, ms: 1_800_000, artists: [{ name: 'B', plays: 9 }] },
      ],
      games: [{ date: '2026-10-24', game: 'Catan' }, { date: '2026-10-24', game: 'Catan' }, { date: '2026-10-24', game: 'Uno' }],
    });
    expect(d.other.groceries).toEqual({ receipts: 3, spent: 50, stores: [{ name: 'Konzum', times: 2 }, { name: 'dm', times: 1 }] });
    expect(d.other.watching).toEqual({ plays: 3, movies: 1, episodes: 2, top: [{ name: 'Severance', times: 2 }, { name: 'Heat', times: 1 }] });
    expect(d.other.music).toEqual({ plays: 60, hours: 2, daysWithMusic: 2, topArtists: [{ name: 'B', times: 14 }, { name: 'A', times: 10 }] });
    expect(d.other.games).toEqual({ games: 3, days: 1, titles: [{ name: 'Catan', times: 2 }, { name: 'Uno', times: 1 }] });
  });
});

