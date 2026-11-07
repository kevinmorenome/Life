// Trips the app drew or suggested from your check-ins that you haven't confirmed. Pure.

import type { Trip } from './types';

/** A trip the calendar drew from check-ins (see `calendarTrips`), never saved: it still needs your word. */
export const isUnconfirmedTrip = (trip: Pick<Trip, 'id'>): boolean => trip.id.startsWith('stay-');

const overlaps = (a: Pick<Trip, 'startDate' | 'endDate'>, b: Pick<Trip, 'startDate' | 'endDate'>) => a.startDate <= b.endDate && a.endDate >= b.startDate;

/**
 * The trips to confirm on a day: the Swarm suggestions that cover it, and the stays the calendar drew that cover it and
 * no suggestion does (the suggestion is the same trip, with a name and the buttons to add or hide it).
 */
export function pendingOnDate(date: string, suggestions: Trip[], drawn: Trip[]): Trip[] {
  const on = (t: Trip) => t.startDate <= date && date <= t.endDate;
  const sug = suggestions.filter(on);
  const stays = drawn.filter((t) => isUnconfirmedTrip(t) && on(t) && !suggestions.some((s) => overlaps(s, t)));
  return [...sug, ...stays];
}

/** The trip to save when you confirm a drawn stay: a new id, so it is no longer drawn as unconfirmed. */
export const confirmedStay = (stay: Trip, now: string): Trip => ({ ...stay, id: `trip-${stay.id}`, createdAt: now, updatedAt: now });
