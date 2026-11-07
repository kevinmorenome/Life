import type { TripitPlan } from '../../../worker/tripitTypes';
import { linkToPlan, mergeCheckins } from '../checkins/checkins';
import type { Checkin } from '../checkins/types';

/** One place row on a day, in the day screen and in the trip's Itinerary: a TripIt plan (with the check-in folded into it) or a Swarm check-in of its own. */
export type PlaceRef =
  | { kind: 'plan'; day: string; plan: TripitPlan; here?: Checkin }
  | { kind: 'checkin'; day: string; checkin: Checkin };

export const refKey = (r: PlaceRef): string => (r.kind === 'plan' ? `plan:${r.plan.id}:${r.day}` : `checkin:${r.checkin.id}`);

/** The Swarm check-in of a row, if it has one. */
export const checkinOf = (r: PlaceRef): Checkin | undefined => (r.kind === 'plan' ? r.here : r.checkin);

/** The rows of one day with something to merge a row with: a plan with no check-in offers the lone check-ins, a lone check-in offers the plans with no check-in and the other lone check-ins; a merged row offers nothing. */
export function candidatesFor(row: PlaceRef, dayRows: PlaceRef[]): PlaceRef[] {
  if (row.kind === 'plan') return row.here ? [] : dayRows.filter((r) => r.kind === 'checkin');
  return dayRows.filter((r) => r !== row && refKey(r) !== refKey(row) && ((r.kind === 'plan' && !r.here) || r.kind === 'checkin'));
}

/** What merging two rows changes: check-ins to save and ids to remove. A plan and a check-in are linked; two check-ins become one. */
export function mergeChanges(a: PlaceRef, b: PlaceRef, now: string): { save: Checkin[]; remove: string[] } | null {
  if (a.kind === 'plan' && b.kind === 'checkin') return a.here ? null : { save: [linkToPlan(b.checkin, a.plan.id, now)], remove: [] };
  if (a.kind === 'checkin' && b.kind === 'plan') return mergeChanges(b, a, now);
  if (a.kind === 'checkin' && b.kind === 'checkin') {
    const m = mergeCheckins(a.checkin, b.checkin, now);
    return m ? { save: [m.keep], remove: [m.drop.id] } : null;
  }
  return null;
}
