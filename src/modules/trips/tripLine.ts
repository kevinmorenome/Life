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

/** The last country you were in before `date` within the trip (the trip's own country before any check-in). */
function countryBefore(trip: TripPlace, date: string, byDay: ReadonlyMap<string, string[]>): string | undefined {
  for (let d = addDays(date, -1); d >= trip.startDate; d = addDays(d, -1)) {
    const seen = byDay.get(d);
    if (seen?.length) return seen[seen.length - 1];
  }
  return tripCountry(trip);
}

/**
 * The flags to draw on a day of a trip: every country you were in on the first day and on each Monday (where a new
 * week's line begins), and on the other days only the countries you got to that day (a different one from where you
 * were before, a layover included). A day without check-ins stays where the day before was and has none of its own.
 */
export function flagsOnDay(trip: TripPlace, date: string, byDay: ReadonlyMap<string, string[]>): string[] {
  const today = byDay.get(date) ?? [];
  const before = countryBefore(trip, date, byDay);
  const first = date === trip.startDate;
  const all = today.length ? today : before ? [before] : [];
  if (first || isMonday(date)) return [...new Set(all)];
  const out: string[] = [];
  let prev = before;
  for (const c of today) {
    if (c !== prev && !out.includes(c)) out.push(c);
    prev = c;
  }
  return out;
}
