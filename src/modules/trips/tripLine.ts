// How a trip is drawn on the calendar: a line through the row of day numbers, with the country's flag on it.
// Pure: which part of the line a day gets, and whether the flag sits on it.

import type { Trip } from './types';

export interface TripDayShape {
  /**
   * `from` runs from the day number to the right edge, `to` from the left edge to the number, `through` all the way,
   * and `none` is a one-day trip (just the flag).
   */
  line: 'none' | 'from' | 'to' | 'through';
  /** The flag is on the line on the first day of the trip and again on each Monday, where a new week's line begins. */
  flag: boolean;
}

const isMonday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 1;

/** The shape of a trip on one of its days (the date must be inside the trip). */
export function tripDayShape(trip: Pick<Trip, 'startDate' | 'endDate'>, date: string): TripDayShape {
  const first = date === trip.startDate;
  const last = date === trip.endDate;
  const line = first && last ? 'none' : first ? 'from' : last ? 'to' : 'through';
  return { line, flag: first || isMonday(date) };
}
