import { describe, expect, it } from 'vitest';
import type { Checkin } from '../checkins/types';
import { checkinCountry, findCountry, homeCountry, plansInCountry, tripCountry, newVisit, parseCountryList, sortEntries, summarize, visitedCountries, visitsToImport } from './countries';

const ci = (country: string | undefined, date: string): Checkin => ({
  id: `swarm-${country}-${date}`,
  venue: 'V',
  country,
  date,
  time: '10:00',
  at: Date.parse(date),
  source: 'swarm',
  createdAt: date,
  updatedAt: date,
});

describe('findCountry', () => {
  it('knows the names Swarm and travel apps use', () => {
    expect(findCountry('Croatia')?.code).toBe('HR');
    expect(findCountry('United States')?.code).toBe('US');
    expect(findCountry('United States of America')?.code).toBe('US');
    expect(findCountry('United Kingdom')?.code).toBe('GB');
    expect(findCountry('England')?.code).toBe('GB');
    expect(findCountry('\tHoly See (Vatican City State)')?.code).toBe('VA');
    expect(findCountry('  côte d’ivoire ')?.code).toBe('CI');
  });
  it('gives nothing for empty or unknown names', () => {
    expect(findCountry('')).toBeUndefined();
    expect(findCountry(undefined)).toBeUndefined();
    expect(findCountry('Atlantis')).toBeUndefined();
  });
  it('does not confuse similar countries', () => {
    expect(findCountry('Niger')?.code).toBe('NE');
    expect(findCountry('Nigeria')?.code).toBe('NG');
    expect(findCountry('Dominica')?.code).toBe('DM');
    expect(findCountry('Dominican Republic')?.code).toBe('DO');
    expect(findCountry('Georgia')?.code).toBe('GE');
  });
});

describe('parseCountryList', () => {
  it('splits lines, merges duplicates (England + UK) and reports unknown names', () => {
    const { found, unknown } = parseCountryList('Austria\nEngland\nUnited Kingdom\n\nNarnia\nCanada, Mexico');
    expect(found.map((c) => c.code).sort()).toEqual(['AT', 'CA', 'GB', 'MX']);
    expect(unknown).toEqual(['Narnia']);
  });
});

describe('visitedCountries', () => {
  it('derives dates from Swarm and keeps list-only countries undated', () => {
    const checkins = [ci('Croatia', '2023-07-02'), ci('Croatia', '2026-11-04'), ci('Hungary', '2023-10-08'), ci(undefined, '2024-01-01')];
    const visits = [newVisit('CA', 'list'), newVisit('HR', 'list')];
    const entries = visitedCountries(checkins, visits);
    expect(entries.map((e) => e.country.code)).toEqual(['HR', 'HU', 'CA']);
    const hr = entries[0];
    expect(hr).toMatchObject({ first: '2023-07-02', last: '2026-11-04', checkins: 2 });
    expect(hr.sources.sort()).toEqual(['list', 'swarm']);
    expect(entries[2]).toMatchObject({ first: undefined, checkins: 0, sources: ['list'] });
  });
  it('uses an earlier hand-entered date than Swarm has', () => {
    const entries = visitedCountries([ci('Croatia', '2023-07-02')], [newVisit('HR', 'manual', '2019-08-01')]);
    expect(entries[0].first).toBe('2019-08-01');
    expect(entries[0].last).toBe('2023-07-02');
  });
  it('ignores check-ins with an unknown country', () => {
    expect(visitedCountries([ci('Atlantis', '2024-01-01')], [])).toEqual([]);
  });
});

describe('sortEntries', () => {
  it('puts undated countries last, by name', () => {
    const e = visitedCountries([], [newVisit('MX', 'list'), newVisit('CA', 'list'), newVisit('FR', 'manual', '2020-01-01')]);
    expect(sortEntries(e).map((x) => x.country.code)).toEqual(['FR', 'CA', 'MX']);
  });
});

describe('summarize', () => {
  it('counts continents, the world share and first visits per year', () => {
    const entries = visitedCountries([ci('Croatia', '2023-07-02'), ci('Hungary', '2023-10-08'), ci('Mexico', '2024-01-01')], [newVisit('VA', 'list')]);
    const s = summarize(entries);
    expect(s.visited).toBe(4);
    expect(s.independent).toBe(4);
    expect(s.continents.find((c) => c.name === 'Europe')?.visited).toBe(3);
    expect(s.continents.find((c) => c.name === 'North America')?.visited).toBe(1);
    expect(s.newPerYear).toEqual([
      { year: '2023', count: 2 },
      { year: '2024', count: 1 },
    ]);
    expect(s.share).toBeCloseTo(4 / 194, 5);
  });
});

describe('visitsToImport', () => {
  it('skips countries that already have a record', () => {
    const { found } = parseCountryList('Austria\nCanada');
    const out = visitsToImport(found, [newVisit('AT', 'manual', '2020-01-01')], '2026-11-04T00:00:00Z');
    expect(out).toEqual([{ id: 'CA', source: 'list', createdAt: '2026-11-04T00:00:00Z', updatedAt: '2026-11-04T00:00:00Z' }]);
  });
});

describe('visitedCountries with trips', () => {
  const trip = (country: string | undefined, startDate: string, endDate: string) => ({ country, startDate, endDate });

  it('counts a trip that has started, with its dates', () => {
    const [e] = visitedCountries([], [], [trip('PT', '2024-05-10', '2024-05-13')], '2026-11-05');
    expect(e).toMatchObject({ first: '2024-05-10', last: '2024-05-13', checkins: 0, sources: ['trip'] });
    expect(e.country.code).toBe('PT');
  });

  it('does not count a trip that has not started, or one without a country', () => {
    expect(visitedCountries([], [], [trip('PT', '2027-01-01', '2027-01-05'), trip(undefined, '2024-01-01', '2024-01-02'), trip('ZZ', '2024-01-01', '2024-01-02')], '2026-11-05')).toEqual([]);
  });

  it('keeps the earliest day across sources and stops a running trip at today', () => {
    const [e] = visitedCountries([ci('Croatia', '2023-07-02')], [], [trip('HR', '2019-08-01', '2019-08-05'), trip('HR', '2026-11-03', '2026-11-20')], '2026-11-05');
    expect(e).toMatchObject({ first: '2019-08-01', last: '2026-11-05', checkins: 1 });
    expect(e.sources).toEqual(['swarm', 'trip']);
  });
});

describe('tripCountry', () => {
  it('uses the country the trip names, else the last word of its destination', () => {
    expect(tripCountry({ country: 'pt', destination: 'Somewhere' })).toBe('PT');
    expect(tripCountry({ destination: 'Zadar, Croatia' })).toBe('HR');
    expect(tripCountry({ country: 'ZZ', destination: 'Vienna, Austria' })).toBe('AT');
  });
  it('gives nothing when neither says', () => {
    expect(tripCountry({})).toBeUndefined();
    expect(tripCountry({ destination: 'Atlantis' })).toBeUndefined();
  });
});

describe('homeCountry', () => {
  const at = (country: string | undefined) => ({ country });
  it('is the one you chose, else the country with most check-ins', () => {
    const list = [at('Croatia'), at('Croatia'), at('Austria'), at(undefined), at('Atlantis')];
    expect(homeCountry(list)).toBe('HR');
    expect(homeCountry(list, 'at')).toBe('AT');
    // A chosen code that is not a country is ignored.
    expect(homeCountry(list, 'ZZ')).toBe('HR');
  });
  it('gives nothing without check-ins in a known country', () => {
    expect(homeCountry([])).toBeUndefined();
    expect(checkinCountry(at('Croatia'))).toBe('HR');
  });
});

describe('visitedCountries with TripIt plans', () => {
  const plan = (location: string | undefined, start: string, end = start) => ({ location, start, end });

  it('counts a plan\'s country like a check-in: first and last day there', () => {
    const entries = visitedCountries([], [], [], '2026-11-05', [
      plan('Hotel, Roma, Italy', '2022-10-02', '2022-10-04'),
      plan('Airport, Roma, Italy', '2022-10-09'),
      plan('Hotel, Wien, Austria', '2022-10-05', '2022-10-08'),
    ]);
    const it = entries.find((e) => e.country.code === 'IT')!;
    expect(it).toMatchObject({ first: '2022-10-02', last: '2022-10-09', sources: ['tripit'] });
    expect(entries.map((e) => e.country.code).sort()).toEqual(['AT', 'IT']);
  });

  it('merges with Swarm and keeps the earliest day', () => {
    const [e] = visitedCountries([ci('Italy', '2025-05-03')], [], [], '2026-11-05', [plan('Hotel, Roma, Italy', '2022-10-02')]);
    expect(e).toMatchObject({ first: '2022-10-02', checkins: 1 });
    expect(e.sources).toEqual(['swarm', 'tripit']);
  });

  it('skips plans that have not started, and ones with no country in their location', () => {
    expect(visitedCountries([], [], [], '2026-11-05', [plan('Hotel, Roma, Italy', '2027-01-01'), plan('Roma', '2022-10-02'), plan(undefined, '2022-10-02')])).toEqual([]);
  });

  it('stops a plan that is still running at today', () => {
    const [e] = visitedCountries([], [], [], '2026-11-05', [plan('Hotel, Roma, Italy', '2026-11-03', '2026-11-20')]);
    expect(e).toMatchObject({ first: '2026-11-03', last: '2026-11-05' });
  });
});

describe('visitedCountries with plan stops', () => {
  const stop = (country: string, date: string) => ({ country, date });
  const plan = (stops: { country: string; date: string }[], location?: string) => ({ location, start: stops[0]?.date ?? '2022-10-01', end: stops[stops.length - 1]?.date ?? '2022-10-01', stops });

  it('counts each stop of a plan on its day, a layover included, like a check-in', () => {
    const entries = visitedCountries([], [], [], '2026-11-05', [plan([stop('MX', '2022-09-23'), stop('DE', '2022-09-23')]), plan([stop('DE', '2022-09-23'), stop('HR', '2022-09-24')])]);
    expect(entries.map((e) => [e.country.code, e.first, e.last]).sort()).toEqual([
      ['DE', '2022-09-23', '2022-09-23'],
      ['HR', '2022-09-24', '2022-09-24'],
      ['MX', '2022-09-23', '2022-09-23'],
    ]);
    expect(entries[0].sources).toEqual(['tripit']);
  });

  it('uses the stops, not the location text, when a plan has them', () => {
    const entries = visitedCountries([], [], [], '2026-11-05', [{ location: 'Hotel, Roma, Italy', start: '2022-10-02', end: '2022-10-05', stops: [stop('AT', '2022-10-02')] }]);
    expect(entries.map((e) => e.country.code)).toEqual(['AT']);
  });

  it('leaves out stops in the future and unknown countries', () => {
    expect(visitedCountries([], [], [], '2026-11-05', [plan([stop('IT', '2027-01-01'), stop('ZZ', '2022-10-01')])])).toEqual([]);
  });
});

describe('plans you removed', () => {
  const stop = (country: string, date: string) => ({ country, date });
  const plan = (id: string, country: string, date: string, removed?: boolean) => ({ id, location: undefined, start: date, end: date, stops: [stop(country, date)], ...(removed ? { removed } : {}) });

  it('count for nothing in the stats', () => {
    expect(visitedCountries([], [], [], '2026-11-05', [plan('a', 'RS', '2023-10-13', true), plan('b', 'HR', '2023-10-14')]).map((e) => e.country.code)).toEqual(['HR']);
  });

  it('are not listed as what puts a country there; the others are, in date order', () => {
    const plans = [plan('late', 'RS', '2024-01-01'), plan('gone', 'RS', '2023-10-13', true), plan('early', 'RS', '2023-10-13'), plan('other', 'HR', '2023-10-13'), plan('future', 'RS', '2030-01-01')];
    expect(plansInCountry(plans, 'RS', '2026-11-05').map((p) => p.id)).toEqual(['early', 'late']);
  });

  it('falls back to the location text for a plan with no stops', () => {
    expect(plansInCountry([{ id: 'x', location: 'Beograd, Serbia', start: '2023-10-13', end: '2023-10-13' }], 'RS', '2026-11-05')).toHaveLength(1);
  });
});
