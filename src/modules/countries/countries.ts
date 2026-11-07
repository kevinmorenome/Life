import type { Checkin } from '../checkins/types';
import type { TripitPlan } from '../../../worker/tripitTypes';
import type { Trip } from '../trips/types';
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

/** The country of a trip as an ISO code: the one it names, else the one in the last word of its destination ("Porto, Portugal"). */
export function tripCountry(trip: Pick<Trip, 'country' | 'destination'>): string | undefined {
  const named = trip.country ? byCode.get(trip.country.toUpperCase()) : undefined;
  if (named) return named.code;
  return findCountry(trip.destination?.split(',').pop())?.code;
}

/** The country a check-in was made in, as an ISO code. */
export const checkinCountry = (c: Pick<Checkin, 'country'>): string | undefined => findCountry(c.country)?.code;

/** Your home country: the one you chose, else the one most of your check-ins are in. */
export function homeCountry(checkins: Pick<Checkin, 'country'>[], chosen?: string): string | undefined {
  const picked = chosen ? byCode.get(chosen.toUpperCase()) : undefined;
  if (picked) return picked.code;
  const counts = new Map<string, number>();
  for (const c of checkins) {
    const code = checkinCountry(c);
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

/** Where you lived for a while: from this day (missing = from the beginning) until the next period starts. */
export interface HomePeriod {
  from?: string;
  /** ISO alpha-2 */
  country: string;
}

/** Your home country on a day, or nothing when it isn't known. */
export type HomeOn = (date: string) => string | undefined;

/**
 * Your home country on each day: the period that started last on or before the day; days no period covers (before
 * the first one starts, or no periods at all) use `chosen` (Settings → Home country), else `auto` (the country of most
 * of your check-ins).
 */
export function homeOnDate(periods: readonly HomePeriod[] | undefined, chosen: string | undefined, auto: string | undefined): HomeOn {
  const valid = (periods ?? []).filter((p) => byCode.has(p.country.toUpperCase())).sort((a, b) => (a.from ?? '').localeCompare(b.from ?? ''));
  const fallback = (chosen ? byCode.get(chosen.toUpperCase())?.code : undefined) ?? auto;
  return (date) => {
    let found: HomePeriod | undefined;
    for (const p of valid) if ((p.from ?? '') <= date) found = p;
    return found ? byCode.get(found.country.toUpperCase())!.code : fallback;
  };
}

/**
 * The country a location text is in, as an ISO code: the last comma-separated part that is a country's name
 * ("Hotel Avenida, 1050 Lisboa, Portugal"). Nothing when no part is one: never a guess from a city.
 */
export function locationCountry(location: string | undefined): string | undefined {
  const parts = (location ?? '').split(',').map((s) => s.trim());
  for (let i = parts.length - 1; i >= 0; i--) {
    const found = findCountry(parts[i]);
    if (found) return found.code;
  }
  return undefined;
}

export type Source = 'swarm' | 'list' | 'manual' | 'trip' | 'tripit';

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

/**
 * Every country you've been to: Swarm check-ins (by country name), the stored list, and trips that name a country
 * (`Trip.country`), and TripIt plans whose location names a country, which count like check-ins: the first plan there
 * gives the first visit and the last one the last visit. A trip or a plan only counts once it has started (`today`), so
 * a planned one isn't "visited" yet.
 */
export function visitedCountries(checkins: Checkin[], visits: CountryVisit[], trips: Pick<Trip, 'country' | 'startDate' | 'endDate'>[] = [], today = '', plans: Pick<TripitPlan, 'location' | 'start' | 'end' | 'stops' | 'removed'>[] = []): CountryEntry[] {
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
  for (const t of trips) {
    const country = t.country ? byCode.get(t.country.toUpperCase()) : undefined;
    if (!country || !today || t.startDate > today) continue;
    const e = entry(country);
    e.first = earliest(e.first, t.startDate);
    const end = t.endDate < today ? t.endDate : today;
    e.last = e.last && e.last > end ? e.last : end;
    if (!e.sources.includes('trip')) e.sources.push('trip');
  }
  // A plan is where it took you: the countries and days in its `stops` (a flight: where it left and where it landed),
  // else the country in its location text over its days.
  const seen = (code: string | undefined, first: string, last: string) => {
    const country = byCode.get(code ?? '');
    if (!country || !today || first > today) return;
    const e = entry(country);
    e.first = earliest(e.first, first);
    const end = last < today ? last : today;
    e.last = e.last && e.last > end ? e.last : end;
    if (!e.sources.includes('tripit')) e.sources.push('tripit');
  };
  for (const p of plans) {
    if (p.removed) continue;
    if (p.stops?.length) for (const s of p.stops) seen(s.country, s.date, s.date);
    else seen(locationCountry(p.location), p.start, p.end);
  }
  return sortEntries([...out.values()]);
}

/** The plans that put a country in your list, in date order: the ones whose stops (or location) are there and have started. */
export function plansInCountry<P extends Pick<TripitPlan, 'location' | 'start' | 'end' | 'stops' | 'removed'>>(plans: P[], code: string, today: string): P[] {
  return plans
    .filter((p) => {
      if (p.removed) return false;
      if (p.stops?.length) return p.stops.some((s) => s.country === code && s.date <= today);
      return locationCountry(p.location) === code && p.start <= today;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
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
