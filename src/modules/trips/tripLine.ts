// How a trip is drawn on the calendar: a line through the row of day numbers, with the country's flag on it.
// Pure: which part of the line a day gets, whether the flag sits on it, and where the dots at its two ends are.

import type { Checkin } from '../checkins/types';
import { checkinCountry, tripCountry } from '../countries/countries';
import type { Trip } from './types';

export interface TripDayShape {
  /**
   * Every trip day has the line: `from` starts at the day number (the first day, also a one-day trip) and `through`
   * runs the whole day, the last day included.
   */
  line: 'from' | 'through';
  /**
   * The flag is on the line on the first day of the trip, again on each Monday (where a new week's line begins) and on
   * a day spent in another country than the day before.
   */
  flag: boolean;
  /** The first day: its number sits on a dot. */
  start: boolean;
  /** The last day: the line ends in a dot. */
  end: boolean;
}

const isMonday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 1;

/** The shape of a trip on one of its days (the date must be inside the trip). `countryChanged`: see `flagsOnDay`. */
export function tripDayShape(trip: Pick<Trip, 'startDate' | 'endDate'>, date: string, newCountry = false): TripDayShape {
  const first = date === trip.startDate;
  return { line: first ? 'from' : 'through', flag: first || isMonday(date) || newCountry, start: first, end: date === trip.endDate };
}

type TripPlace = Pick<Trip, 'startDate' | 'endDate' | 'country' | 'destination'>;

const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * The countries you checked in from on each day, as ISO codes in the order you were there (check-ins are real Swarm
 * ones and the ones made from itinerary plans). Airports count: a layover in Amsterdam is a day in the Netherlands.
 */
export function checkinCountriesByDay(checkins: (Pick<Checkin, 'country' | 'date'> & { at?: number })[]): Map<string, string[]> {
  const sorted = [...checkins].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const out = new Map<string, string[]>();
  for (const c of sorted) {
    const code = checkinCountry(c);
    if (!code) continue;
    const day = out.get(c.date) ?? [];
    if (day[day.length - 1] !== code) day.push(code);
    out.set(c.date, day);
  }
  return out;
}

/** The countries seen in the `back` days before `date` (within the trip), plus the trip's own country before any check-in. */
function recentCountries(trip: TripPlace, date: string, byDay: ReadonlyMap<string, string[]>, back: number): Set<string> {
  const seen = new Set<string>();
  for (let d = addDays(date, -1), n = 0; d >= trip.startDate && n < back; d = addDays(d, -1), n++) for (const c of byDay.get(d) ?? []) seen.add(c);
  const own = tripCountry(trip);
  if (seen.size === 0 && own) seen.add(own);
  return seen;
}

/** Most flags a day shows; a day crossing a border back and forth stays readable. */
export const MAX_FLAGS = 3;

/** A country counts as new again when you haven't been in it for this many days (a daily commute is not a trip). */
const BACK = 3;

/**
 * The flags to draw on a day of a trip: every country you were in on the first day and on each Monday (where a new
 * week's line begins), and on the other days only the countries you got to that day that you had not been in during
 * the last few days (a layover included; going back and forth over a border shows no new flag). At most `MAX_FLAGS`.
 */
export function flagsOnDay(trip: TripPlace, date: string, byDay: ReadonlyMap<string, string[]>): string[] {
  const today = [...new Set(byDay.get(date) ?? [])];
  if (date === trip.startDate || isMonday(date)) {
    const all = today.length ? today : [...recentCountries(trip, date, byDay, 1)].slice(0, 1);
    return all.slice(0, MAX_FLAGS);
  }
  const before = recentCountries(trip, date, byDay, BACK);
  return today.filter((c) => !before.has(c)).slice(0, MAX_FLAGS);
}
