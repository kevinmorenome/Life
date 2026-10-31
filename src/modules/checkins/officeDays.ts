import type { WorkDay } from '../work/types';
import { venueKey } from './placeStats';
import type { Checkin } from './types';

/** Monday to Friday, for a YYYY-MM-DD date. */
export const isWeekday = (date: string): boolean => {
  const d = new Date(date + 'T00:00:00Z').getUTCDay();
  return d >= 1 && d <= 5;
};

/**
 * Office days implied by check-ins at your office: a weekday with a check-in there and nothing recorded for
 * it yet. Days already set (by hand, from the badge report or earlier from Swarm) are never touched, and
 * nothing is inferred for days without a check-in, since those could be home, leave or a trip.
 */
export function officeBackfill(checkins: Checkin[], officeVenue: string, existing: WorkDay[], now: string): WorkDay[] {
  const have = new Set(existing.map((d) => d.id));
  const dates = new Set(checkins.filter((c) => venueKey(c) === officeVenue && isWeekday(c.date)).map((c) => c.date));
  return [...dates]
    .filter((date) => !have.has(date))
    .sort()
    .map((id) => ({ id, status: 'office' as const, source: 'swarm' as const, updatedAt: now }));
}
