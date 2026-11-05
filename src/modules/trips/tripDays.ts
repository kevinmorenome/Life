import type { Trip } from './types';

/** Longest trip we lay out day by day. */
const MAX_DAYS = 90;

/** Every YYYY-MM-DD from start to end inclusive (empty if end is before start). */
export function tripDays(trip: Pick<Trip, 'startDate' | 'endDate'>): string[] {
  const days: string[] = [];
  const d = new Date(trip.startDate + 'T00:00:00Z');
  const end = new Date(trip.endDate + 'T00:00:00Z');
  while (d <= end && days.length < MAX_DAYS) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}
