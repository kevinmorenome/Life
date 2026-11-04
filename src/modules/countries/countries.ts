import type { Checkin } from '../checkins/types';
import { COUNTRY_ROWS } from './countryData';
import type { CountryVisit } from './types';

export interface Country {
  code: string;
  name: string;
  continent: string;
  /** ISO numeric, the id used by the map. */
  numeric: string;
  lat: number;
  lng: number;
  independent: boolean;
  names: string[];
}

export const COUNTRIES: Country[] = COUNTRY_ROWS.map(([code, name, continent, numeric, lat, lng, independent, names]) => ({
  code,
  name,
  continent,
  numeric,
  lat,
  lng,
  independent: independent === 1,
  names,
}));

export const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica'] as const;

/** Names people use that the table doesn't list (England is part of the United Kingdom, as in Swarm). */
const EXTRA_NAMES: Record<string, string> = {
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  'great britain': 'GB',
  uk: 'GB',
  usa: 'US',
  'united states of america': 'US',
  america: 'US',
  holland: 'NL',
  'czech republic': 'CZ',
  'holy see': 'VA',
  vatican: 'VA',
  'ivory coast': 'CI',
  burma: 'MM',
  'south korea': 'KR',
  'north korea': 'KP',
  macedonia: 'MK',
  swaziland: 'SZ',
  turkey: 'TR',
  turkiye: 'TR',
};

/** Lower case, no accents, letters and digits only: "Côte d'Ivoire" and "cote d ivoire" match. */
export const normalizeName = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));
const byName = new Map<string, Country>();
// The common name wins over another country's alternative spelling.
for (const c of COUNTRIES) for (const n of c.names) if (n.length > 2) byName.set(normalizeName(n), c);
for (const c of COUNTRIES) byName.set(normalizeName(c.name), c);
for (const [n, code] of Object.entries(EXTRA_NAMES)) byName.set(n, byCode.get(code)!);

export const countryByCode = (code: string): Country | undefined => byCode.get(code.toUpperCase());

/** The country a name (or ISO code) stands for. Empty and unknown names give undefined. */
export function findCountry(name: string | undefined): Country | undefined {
  const key = normalizeName(name ?? '');
  if (!key) return undefined;
  return byName.get(key) ?? (key.length === 2 ? byCode.get(key.toUpperCase()) : undefined);
}

/** Names from a pasted list: one per line (commas and semicolons work too). */
export function parseCountryList(text: string): { found: Country[]; unknown: string[] } {
  const found = new Map<string, Country>();
  const unknown: string[] = [];
  for (const raw of text.split(/[\n;,]+/)) {
    const name = raw.trim();
    if (!name) continue;
    const c = findCountry(name);
    if (c) found.set(c.code, c);
    else if (!unknown.includes(name)) unknown.push(name);
  }
  return { found: [...found.values()], unknown };
}

export type Source = 'swarm' | 'list' | 'manual';

export interface CountryEntry {
  country: Country;
  /** Earliest known day; undefined when nothing says when. */
  first?: string;
  /** Latest check-in day (undefined without Swarm check-ins). */
  last?: string;
  checkins: number;
  sources: Source[];
  /** The stored record (list / manual), if any. */
  visit?: CountryVisit;
}

const earliest = (a?: string, b?: string) => (a && b ? (a < b ? a : b) : (a ?? b));

/** Every country you've been to: Swarm check-ins (by country name) merged with the stored list. */
export function visitedCountries(checkins: Checkin[], visits: CountryVisit[]): CountryEntry[] {
  const out = new Map<string, CountryEntry>();
  const entry = (country: Country) => {
    let e = out.get(country.code);
    if (!e) out.set(country.code, (e = { country, checkins: 0, sources: [] }));
    return e;
  };
  for (const c of checkins) {
    const country = findCountry(c.country);
    if (!country) continue;
    const e = entry(country);
    e.checkins++;
    e.first = earliest(e.first, c.date);
    e.last = e.last && e.last > c.date ? e.last : c.date;
    if (!e.sources.includes('swarm')) e.sources.push('swarm');
  }
  for (const v of visits) {
    const country = byCode.get(v.id);
    if (!country) continue;
    const e = entry(country);
    e.visit = v;
    e.first = earliest(e.first, v.firstVisit);
    if (!e.sources.includes(v.source)) e.sources.push(v.source);
  }
  return sortEntries([...out.values()]);
}

/** Oldest first visit first; countries with no known date after those, by name. */
export function sortEntries(entries: CountryEntry[]): CountryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.first && b.first) return a.first.localeCompare(b.first) || a.country.name.localeCompare(b.country.name);
    if (a.first) return -1;
    if (b.first) return 1;
    return a.country.name.localeCompare(b.country.name);
  });
}

export const WORLD_COUNTRIES = COUNTRIES.filter((c) => c.independent).length;

export interface CountrySummary {
  visited: number;
  /** Of the countries recognised as independent (a territory you visited doesn't count towards it). */
  independent: number;
  share: number;
  /** Visited countries per continent, in `CONTINENTS` order, with the number of countries there. */
  continents: { name: string; visited: number; total: number }[];
  /** Countries with a first visit in each year, oldest first. */
  newPerYear: { year: string; count: number }[];
}

export function summarize(entries: CountryEntry[]): CountrySummary {
  const independent = entries.filter((e) => e.country.independent).length;
  const continents = CONTINENTS.map((name) => ({
    name,
    visited: entries.filter((e) => e.country.continent === name).length,
    total: COUNTRIES.filter((c) => c.continent === name && (c.independent || name === 'Antarctica')).length,
  }));
  const years = new Map<string, number>();
  for (const e of entries) if (e.first) years.set(e.first.slice(0, 4), (years.get(e.first.slice(0, 4)) ?? 0) + 1);
  return {
    visited: entries.length,
    independent,
    share: WORLD_COUNTRIES ? independent / WORLD_COUNTRIES : 0,
    continents,
    newPerYear: [...years].sort(([a], [b]) => a.localeCompare(b)).map(([year, count]) => ({ year, count })),
  };
}

/** A new stored record for a country. Fresh each time: callers skip codes that already have one. */
export function newVisit(code: string, source: CountryVisit['source'], firstVisit?: string, now = new Date().toISOString()): CountryVisit {
  return { id: code, ...(firstVisit ? { firstVisit } : {}), source, createdAt: now, updatedAt: now };
}

/** Records to save for a pasted list: a country that already has a record, or any Swarm check-in, is left alone. */
export function visitsToImport(found: Country[], existing: CountryVisit[], now = new Date().toISOString()): CountryVisit[] {
  const have = new Set(existing.map((v) => v.id));
  return found.filter((c) => !have.has(c.code)).map((c) => newVisit(c.code, 'list', undefined, now));
}
