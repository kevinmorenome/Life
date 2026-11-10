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
