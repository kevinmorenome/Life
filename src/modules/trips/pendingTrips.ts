// Trips the app drew or suggested from your check-ins that you haven't confirmed. Pure.

import type { Trip } from './types';

/** A trip the calendar drew from check-ins (see `calendarTrips`), never saved: it still needs your word. */
export const isUnconfirmedTrip = (trip: Pick<Trip, 'id'>): boolean => trip.id.startsWith('stay-');

/**
 * The trips to confirm on a day: the Swarm suggestions that cover it, and the stays the calendar drew that cover it
 * when no suggestion does (a suggestion is the same trip with a name and the buttons to add or hide it). A stay can run
 * a day longer than its suggestion (a flight's airport check-ins count for the stay, not for the suggestion), so that
 * day still gets the stay.
 */
export function pendingOnDate(date: string, suggestions: Trip[], drawn: Trip[]): Trip[] {
  const on = (t: Trip) => t.startDate <= date && date <= t.endDate;
  const sug = suggestions.filter(on);
  const stays = sug.length ? [] : drawn.filter((t) => isUnconfirmedTrip(t) && on(t));
  return [...sug, ...stays];
}

/** The trip to save when you confirm a drawn stay: a new id, so it is no longer drawn as unconfirmed. */
export const confirmedStay = (stay: Trip, now: string): Trip => ({ ...stay, id: `trip-${stay.id}`, createdAt: now, updatedAt: now });
