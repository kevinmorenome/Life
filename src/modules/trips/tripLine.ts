// How a trip is drawn on the calendar: a line through the row of day numbers, with the country's flag on it.
// Pure: which part of the line a day gets, whether the flag sits on it, and where the dots at its two ends are.

import type { Trip } from './types';

export interface TripDayShape {
  /**
   * Every trip day has the line: `from` starts at the day number (the first day, also a one-day trip) and `through`
   * runs the whole day, the last day included.
   */
  line: 'from' | 'through';
  /** The flag is on the line on the first day of the trip and again on each Monday, where a new week's line begins. */
  flag: boolean;
  /** The first day: its number sits on a dot. */
  start: boolean;
  /** The last day: the line ends in a dot. */
  end: boolean;
}

const isMonday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 1;

/** The shape of a trip on one of its days (the date must be inside the trip). */
export function tripDayShape(trip: Pick<Trip, 'startDate' | 'endDate'>, date: string): TripDayShape {
  const first = date === trip.startDate;
  return { line: first ? 'from' : 'through', flag: first || isMonday(date), start: first, end: date === trip.endDate };
}
