// Time abroad that isn't in the Trips module is still a trip on the calendar: runs of days with Swarm check-ins in
// another country than home, drawn as a line with that country's flag, like a recorded trip. Pure.

import type { Checkin } from '../checkins/types';
import { checkinCountry, countryByCode } from '../countries/countries';
import type { Trip } from './types';

export interface Stay {
  country: string;
  /** First and last YYYY-MM-DD with a check-in there (the days between are included). */
  startDate: string;
  endDate: string;
}

/** Days apart (b − a) of two YYYY-MM-DD dates. */
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * Runs of days abroad: check-ins in the same foreign country up to `maxGap` days apart belong to one stay (you don't
 * check in every day), and a check-in at home in between ends it. A day with check-ins in several countries counts
 * for the one with most of them.
 */
export function abroadStays(checkins: Pick<Checkin, 'country' | 'date'>[], home: string | undefined, maxGap = 3): Stay[] {
  if (!home) return [];
  const homeDays = new Set<string>();
  const foreign = new Map<string, Map<string, number>>();
  for (const c of checkins) {
    const code = checkinCountry(c);
    if (!code) continue;
    if (code === home) {
      homeDays.add(c.date);
      continue;
    }
    const day = foreign.get(c.date) ?? new Map<string, number>();
    day.set(code, (day.get(code) ?? 0) + 1);
    foreign.set(c.date, day);
  }
  const stays: Stay[] = [];
  let current: Stay | undefined;
  for (const date of [...foreign.keys()].sort()) {
    const country = [...foreign.get(date)!.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    const continues =
      current &&
      current.country === country &&
      daysBetween(current.endDate, date) <= maxGap &&
      ![...homeDays].some((h) => h > current!.endDate && h < date);
    if (current && continues) current.endDate = date;
    else {
      if (current) stays.push(current);
      current = { country, startDate: date, endDate: date };
    }
  }
  if (current) stays.push(current);
  return stays;
}

/** Leaves out stays that share a day with a Swarm suggestion you hid, so a trip you said is not one isn't drawn. */
export function withoutHidden(stays: Stay[], hidden: Pick<Trip, 'startDate' | 'endDate'>[]): Stay[] {
  return stays.filter((s) => !hidden.some((h) => h.startDate <= s.endDate && h.endDate >= s.startDate));
}

/**
 * The trips the calendar draws: your own, plus the stays abroad that no trip of yours covers (a stay that shares
 * any day with a recorded trip is left out: the trip is the one you wrote down). Stays become trip-shaped entries
 * named after the country; they are never saved.
 */
export function calendarTrips(trips: Trip[], stays: Stay[]): Trip[] {
  const extra = stays
    .filter((s) => !trips.some((t) => t.startDate <= s.endDate && t.endDate >= s.startDate))
    .map((s): Trip => {
      const name = countryByCode(s.country)?.name ?? s.country;
      return {
        id: `stay-${s.country}-${s.startDate}`,
        name,
        destination: name,
        country: s.country,
        startDate: s.startDate,
        endDate: s.endDate,
        itemIds: [],
        extras: [],
        packed: [],
        createdAt: '',
        updatedAt: '',
      };
    });
  return [...trips, ...extra];
}
