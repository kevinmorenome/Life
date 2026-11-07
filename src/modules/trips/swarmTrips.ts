// Turns Swarm check-ins into trips: a run of days checked in outside your home country is a trip.
// Check-ins at airports don't count. Pure.

import { findCountry, type AwayOf, type HomeOn } from '../countries/countries';
import type { Checkin } from '../checkins/types';
import type { Trip } from './types';

/** Days without a check-in that still count as the same trip (quiet days on a beach, a long drive). */
export const MAX_GAP_DAYS = 4;
/** A run longer than this is living somewhere, not a trip. */
export const MAX_TRIP_DAYS = 60;
/** Too few days of history to tell where home is. */
const MIN_DAYS_FOR_HOME = 10;

const AIRPORT = /airport|aeroport|aeropuerto|aeroporto|flughafen|zra[cč]na luka|aerodrom/i;
/** Things inside an airport (a shop, a gate) have no airport word of their own, so anything this close to one counts. */
const AIRPORT_RADIUS_KM = 1.5;

const km = (a: Checkin, b: Checkin): number => {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat! - a.lat!) * rad) / 2) ** 2 + Math.cos(a.lat! * rad) * Math.cos(b.lat! * rad) * Math.sin(((b.lng! - a.lng!) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

export const isAirportCheckin = (c: { category?: string; venue?: string }): boolean => AIRPORT.test(`${c.category ?? ''} ${c.venue ?? ''}`);

/**
 * Check-ins that say nothing about being on a trip: at an airport (the airport, a terminal, a gate, a lounge, by its
 * category or name) or within `AIRPORT_RADIUS_KM` of one (the café past security). A layover is not a trip.
 */
export function withoutAirports(checkins: Checkin[]): Checkin[] {
  const airports = checkins.filter((c) => isAirportCheckin(c) && c.lat !== undefined && c.lng !== undefined);
  return checkins.filter((c) => !isAirportCheckin(c) && !(c.lat !== undefined && c.lng !== undefined && airports.some((a) => km(a, c) <= AIRPORT_RADIUS_KM)));
}

const day = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Stop {
  date: string;
  /** ISO code when known, else the lowercased name Swarm gave. */
  key: string;
  name: string;
  code?: string;
  city?: string;
  firstCheckin: string;
  /** Against your home (only with `awayOf`). */
  away?: 'home' | 'near' | 'far';
}

export interface SwarmRun {
  /** The id of the first check-in: names the trip (`Trip.swarmRef`). */
  ref: string;
  start: string;
  end: string;
  countries: { name: string; code?: string }[];
  city?: string;
  /** Every day was in your home country (another city of it), so the trip is named after the city. */
  domestic?: boolean;
}

/** One entry per day you checked in (the first check-in of the day decides the country). */
function stops(checkins: Checkin[], awayOf?: AwayOf): Stop[] {
  const byDay = new Map<string, Stop>();
  const sorted = withoutAirports(checkins).filter((c) => c.country?.trim()).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  for (const c of sorted) {
    if (byDay.has(c.date)) continue;
    const country = findCountry(c.country);
    byDay.set(c.date, {
      date: c.date,
      key: country?.code ?? c.country!.trim().toLowerCase(),
      name: country?.name ?? c.country!.trim(),
      code: country?.code,
      city: c.city?.trim() || undefined,
      firstCheckin: c.id,
      ...(awayOf ? { away: awayOf(c) } : {}),
    });
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Home is the country you checked in from on the most days. */
export function homeCountry(checkins: Checkin[]): string | undefined {
  const days = stops(checkins);
  if (days.length < MIN_DAYS_FOR_HOME) return undefined;
  const counts = new Map<string, number>();
  for (const s of days) counts.set(s.key, (counts.get(s.key) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

/**
 * Runs of days away from home that have ended (nothing for `MAX_GAP_DAYS` since, so one in progress isn't cut short).
 * A check-in at home ends a run; so does a long silence.
 */
export function awayRuns(checkins: Checkin[], today: string, homeOn?: HomeOn, awayOf?: AwayOf): SwarmRun[] {
  const auto = homeCountry(checkins);
  if (!auto && !homeOn && !awayOf) return [];
  const runs: Stop[][] = [];
  let current: Stop[] = [];
  for (const s of stops(checkins, awayOf)) {
    const last = current[current.length - 1];
    const homeNow = homeOn?.(s.date) ?? auto;
    if (awayOf ? !s.away : !homeNow) continue;
    if (awayOf ? s.away === 'home' : s.key === homeNow) {
      if (current.length) runs.push(current);
      current = [];
    } else if (last && day(s.date) - day(last.date) > MAX_GAP_DAYS + 1) {
      runs.push(current);
      current = [s];
    } else current.push(s);
  }
  if (current.length) runs.push(current);

  return runs
    // Days in another town of your own country need two days, unless one was far away.
    .filter((r) => !awayOf || !r.every((x) => x.key === (homeOn?.(x.date) ?? auto)) || r.length >= 2 || r.some((x) => x.away === 'far'))
    .filter((r) => day(r[r.length - 1].date) + MAX_GAP_DAYS < day(today))
    .filter((r) => day(r[r.length - 1].date) - day(r[0].date) + 1 <= MAX_TRIP_DAYS)
    .map((r) => {
      const countries: SwarmRun['countries'] = [];
      for (const s of r) if (!countries.some((c) => c.name === s.name)) countries.push({ name: s.name, code: s.code });
      const cities = new Map<string, number>();
      for (const s of r) if (s.city) cities.set(s.city, (cities.get(s.city) ?? 0) + 1);
      const city = [...cities.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
      const domestic = !!awayOf && r.every((x) => x.key === (homeOn?.(x.date) ?? auto));
      return { ref: r[0].firstCheckin, start: r[0].date, end: r[r.length - 1].date, countries, ...(city ? { city } : {}), ...(domestic ? { domestic } : {}) };
    });
}

export function tripFromRun(run: SwarmRun, now: string): Trip {
  const names = run.countries.map((c) => c.name);
  const main = run.countries[0];
  return {
    id: `trip-${run.ref}`,
    name: run.domestic && run.city ? run.city : names.length <= 3 ? names.join(' & ') : `Trip · ${MONTHS[Number(run.start.slice(5, 7)) - 1]} ${run.start.slice(0, 4)}`,
    ...(run.city ? { destination: run.city.slice(0, 80) } : {}),
    ...(main.code ? { country: main.code } : {}),
    startDate: run.start,
    endDate: run.end,
    itemIds: [],
    extras: [],
    packed: [],
    swarmRef: run.ref,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The trips to add for these check-ins. Never touches a trip that exists: a run is skipped when a trip already
 * carries its `swarmRef`, when you deleted it (`dismissed`), or when any trip of yours (by hand or from TripIt)
 * already covers some of its days.
 */
export function newSwarmTrips(checkins: Checkin[], trips: Trip[], dismissed: readonly string[], today: string, now: string, homeOn?: HomeOn, awayOf?: AwayOf): Trip[] {
  return openRuns(checkins, trips, today, homeOn, awayOf)
    .filter((run) => !dismissed.includes(run.ref))
    .map((run) => tripFromRun(run, now));
}

/** The suggestions you hid (or whose trip you deleted), so a mistake can be undone. */
export function hiddenSwarmTrips(checkins: Checkin[], trips: Trip[], dismissed: readonly string[], today: string, now: string, homeOn?: HomeOn, awayOf?: AwayOf): Trip[] {
  return openRuns(checkins, trips, today, homeOn, awayOf)
    .filter((run) => dismissed.includes(run.ref))
    .map((run) => tripFromRun(run, now));
}

/** Runs with no trip yet: not already added and not overlapping a trip of yours. */
function openRuns(checkins: Checkin[], trips: Trip[], today: string, homeOn?: HomeOn, awayOf?: AwayOf): SwarmRun[] {
  return awayRuns(checkins, today, homeOn, awayOf).filter(
    (run) => !trips.some((t) => t.swarmRef === run.ref) && !trips.some((t) => t.startDate <= run.end && t.endDate >= run.start),
  );
}
