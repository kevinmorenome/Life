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

/** The shape of a trip on one of its days (the date must be inside the trip). `countryChanged`: see `countryChangedOn`. */
export function tripDayShape(trip: Pick<Trip, 'startDate' | 'endDate'>, date: string, countryChanged = false): TripDayShape {
  const first = date === trip.startDate;
  return { line: first ? 'from' : 'through', flag: first || isMonday(date) || countryChanged, start: first, end: date === trip.endDate };
}

type TripPlace = Pick<Trip, 'startDate' | 'endDate' | 'country' | 'destination'>;

const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Where you were on each day you checked in, as an ISO code: the country with the most check-ins that day (ties go to
 * the first code alphabetically). Airports count here: a layover in Amsterdam is a day in the Netherlands.
 */
export function checkinCountriesByDay(checkins: Pick<Checkin, 'country' | 'date'>[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const c of checkins) {
    const code = checkinCountry(c);
    if (!code) continue;
    const day = counts.get(c.date) ?? new Map<string, number>();
    day.set(code, (day.get(code) ?? 0) + 1);
    counts.set(c.date, day);
  }
  const out = new Map<string, string>();
  for (const [date, day] of counts) out.set(date, [...day.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
  return out;
}

/**
 * The country to show for a day of a trip: where that day's check-ins were; a day without any stays where the day
 * before was (back to the trip's first day), and before any check-in it is the trip's own country.
 */
export function countryOnDay(trip: TripPlace, date: string, byDay: ReadonlyMap<string, string>): string | undefined {
  for (let d = date; d >= trip.startDate; d = addDays(d, -1)) {
    const seen = byDay.get(d);
    if (seen) return seen;
  }
  return tripCountry(trip);
}

/** Whether a day of the trip (not the first) is in another country than the day before it. */
export function countryChangedOn(trip: TripPlace, date: string, byDay: ReadonlyMap<string, string>): boolean {
  if (date <= trip.startDate) return false;
  return countryOnDay(trip, date, byDay) !== countryOnDay(trip, addDays(date, -1), byDay);
}
