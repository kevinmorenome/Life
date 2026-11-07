import { describe, expect, it } from 'vitest';
import type { Checkin } from '../checkins/types';
import { makeAwayOf } from '../countries/countries';
import { awayRuns, hiddenSwarmTrips, homeCountry, newSwarmTrips, withoutAirports } from './swarmTrips';
import type { Trip } from './types';

let n = 0;
const ci = (date: string, country: string, city = 'X'): Checkin => ({
  id: `swarm-${++n}`,
  venue: 'v',
  city,
  country,
  date,
  time: '12:00',
  at: Date.parse(`${date}T12:00:00Z`) / 1000,
  source: 'swarm',
  createdAt: '',
  updatedAt: '',
});
const days = (from: number, count: number, country: string, month = '2026-01') =>
  Array.from({ length: count }, (_, i) => ci(`${month}-${String(from + i).padStart(2, '0')}`, country));

const home = days(1, 12, 'Croatia', '2026-02');
const TODAY = '2026-11-06';
const NOW = '2026-11-06T10:00:00.000Z';
const trip = (over: Partial<Trip>): Trip => ({ id: 't', name: 'Mine', startDate: '2026-01-01', endDate: '2026-01-02', itemIds: [], extras: [], packed: [], createdAt: '', updatedAt: '', ...over });

describe('homeCountry', () => {
  it('is where you checked in on the most days, and unknown with little history', () => {
    expect(homeCountry([...home, ...days(1, 3, 'Mexico', '2026-03')])).toBe('HR');
    expect(homeCountry(days(1, 5, 'Croatia'))).toBeUndefined();
  });
});

describe('awayRuns', () => {
  it('makes one trip of check-ins abroad, spanning quiet days', () => {
    const mexico = [ci('2026-03-10', 'Mexico', 'Tulum'), ci('2026-03-11', 'Mexico', 'Tulum'), ci('2026-03-14', 'Mexico', 'Cancún')];
    const runs = awayRuns([...home, ...mexico], TODAY);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ start: '2026-03-10', end: '2026-03-14', city: 'Tulum' });
    expect(runs[0].countries).toEqual([{ name: 'Mexico', code: 'MX' }]);
  });
  it('splits at a check-in at home or a long silence', () => {
    const a = [ci('2026-03-10', 'Mexico'), ci('2026-03-12', 'Mexico')];
    const b = [ci('2026-03-13', 'Croatia'), ci('2026-03-20', 'Italy'), ci('2026-04-20', 'Italy')];
    expect(awayRuns([...home, ...a, ...b], TODAY).map((r) => [r.start, r.end])).toEqual([
      ['2026-03-10', '2026-03-12'],
      ['2026-03-20', '2026-03-20'],
      ['2026-04-20', '2026-04-20'],
    ]);
  });
  it('keeps several countries in one trip', () => {
    const runs = awayRuns([...home, ci('2026-03-10', 'Mexico'), ci('2026-03-12', 'United States')], TODAY);
    expect(runs[0].countries.map((c) => c.code)).toEqual(['MX', 'US']);
  });
  it('waits for a trip still in progress, and skips a stay that is really living abroad', () => {
    expect(awayRuns([...home, ci('2026-11-04', 'Mexico')], TODAY)).toEqual([]);
    const years = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05'].flatMap((m) => days(1, 28, 'Croatia', m));
    const stay = ['2026-04', '2026-05', '2026-06'].flatMap((m) => days(1, 28, 'Poland', m));
    expect(awayRuns([...years, ...stay], TODAY)).toEqual([]);
  });
});

describe('newSwarmTrips', () => {
  const checkins = [...home, ci('2026-03-10', 'Mexico', 'Tulum'), ci('2026-03-12', 'Mexico', 'Tulum')];
  it('names the trip after the country', () => {
    const [t] = newSwarmTrips(checkins, [], [], TODAY, NOW);
    expect(t).toMatchObject({ name: 'Mexico', country: 'MX', destination: 'Tulum', startDate: '2026-03-10', endDate: '2026-03-12' });
    expect(t.swarmRef).toBe(checkins[home.length].id);
  });
  it('skips what is known, deleted or covered by a trip of yours', () => {
    const [t] = newSwarmTrips(checkins, [], [], TODAY, NOW);
    expect(newSwarmTrips(checkins, [t], [], TODAY, NOW)).toEqual([]);
    expect(newSwarmTrips(checkins, [], [t.swarmRef!], TODAY, NOW)).toEqual([]);
    expect(newSwarmTrips(checkins, [trip({ startDate: '2026-03-11', endDate: '2026-03-20' })], [], TODAY, NOW)).toEqual([]);
  });
});

describe('hiddenSwarmTrips', () => {
  const checkins = [...home, ci('2026-03-10', 'Mexico'), ci('2026-03-12', 'Mexico')];
  it('lists what you hid, so it can be brought back', () => {
    const [t] = newSwarmTrips(checkins, [], [], TODAY, NOW);
    expect(hiddenSwarmTrips(checkins, [], [], TODAY, NOW)).toEqual([]);
    expect(hiddenSwarmTrips(checkins, [], [t.swarmRef!], TODAY, NOW).map((x) => x.swarmRef)).toEqual([t.swarmRef]);
    expect(newSwarmTrips(checkins, [], [t.swarmRef!], TODAY, NOW)).toEqual([]);
    expect(hiddenSwarmTrips(checkins, [t], [t.swarmRef!], TODAY, NOW)).toEqual([]);
  });
});

describe('airports', () => {
  const at = (c: Checkin, category: string, venue: string, lat: number, lng: number): Checkin => ({ ...c, category, venue, lat, lng });
  it('drops airports, gates and lounges, and anything right next to an airport', () => {
    const airport = at(ci('2026-03-10', 'Mexico'), 'Airport', 'Cancún International Airport', 21.0365, -86.8771);
    const gate = at(ci('2026-03-10', 'Mexico'), 'Airport Gate', 'Gate 12', 21.0372, -86.8765);
    const cafe = at(ci('2026-03-10', 'Mexico'), 'Coffee Shop', 'Starbucks', 21.038, -86.878);
    const beach = at(ci('2026-03-11', 'Mexico'), 'Beach', 'Playa Delfines', 21.0586, -86.7897);
    expect(withoutAirports([airport, gate, cafe, beach])).toEqual([beach]);
  });
  it('does not make a trip out of a layover', () => {
    const layover = [at(ci('2026-03-10', 'Netherlands'), 'Airport Terminal', 'Schiphol Terminal 2', 52.31, 4.76), at(ci('2026-03-10', 'Netherlands'), 'Coffee Shop', 'Starbucks', 52.311, 4.761)];
    expect(awayRuns([...home, ...layover], TODAY)).toEqual([]);
  });
  it('still makes the trip when there are other check-ins', () => {
    const run = awayRuns([...home, at(ci('2026-03-10', 'Mexico'), 'Airport', 'Airport', 21.03, -86.87), ci('2026-03-11', 'Mexico')], TODAY);
    expect(run.map((r) => [r.start, r.end])).toEqual([['2026-03-11', '2026-03-11']]);
  });
});

describe('a home city', () => {
  const zagreb = Array.from({ length: 12 }, (_, i) => ci(`2026-02-${String(i + 1).padStart(2, '0')}`, 'Croatia', 'Zagreb'));
  const checkins = [...zagreb, ci('2026-03-10', 'Croatia', 'Split'), ci('2026-03-11', 'Croatia', 'Split'), ci('2026-04-05', 'Croatia', 'Samobor'), ci('2026-03-20', 'Croatia', 'Zagreb')];
  const awayOf = makeAwayOf(() => ({ country: 'HR', city: 'Zagreb' }), zagreb);
  it('makes a trip of days in another city of the home country, named after the city', () => {
    expect(awayRuns(checkins, TODAY)).toEqual([]);
    const trips = newSwarmTrips(checkins, [], [], TODAY, NOW, () => 'HR', awayOf);
    expect(trips.map((t) => [t.name, t.country, t.startDate, t.endDate])).toEqual([['Split', 'HR', '2026-03-10', '2026-03-11']]);
  });
});
