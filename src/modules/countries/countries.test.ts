import { describe, expect, it } from 'vitest';
import type { Checkin } from '../checkins/types';
import { findCountry, newVisit, parseCountryList, sortEntries, summarize, visitedCountries, visitsToImport } from './countries';

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
