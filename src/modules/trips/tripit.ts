// Turns TripIt plans (the `tripitplans` store, written by the Worker) into trips. Pure.

import type { TripitPlan } from '../../../worker/tripitTypes';
import { locationCountry } from '../countries/countries';
import type { Trip } from './types';

export interface PlanGroup {
  /** The earliest plan: its id names the trip (`Trip.tripitRef`). */
  ref: string;
  start: string;
  end: string;
  plans: TripitPlan[];
  tripName?: string;
}

const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Plans that touch or overlap (the next starts no later than the day after the group ends) belong to one trip.
 * A hotel booked for the whole stay covers the flights around it, so a trip comes out as one group.
 */
export function groupPlans(plans: TripitPlan[]): PlanGroup[] {
  const sorted = [...plans].sort((a, b) => a.start.localeCompare(b.start) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.id.localeCompare(b.id));
  const groups: PlanGroup[] = [];
  for (const plan of sorted) {
    const last = groups[groups.length - 1];
    if (last && plan.start <= addDays(last.end, 1)) {
      last.plans.push(plan);
      if (plan.end > last.end) last.end = plan.end;
    } else {
      groups.push({ ref: plan.id, start: plan.start, end: plan.end, plans: [plan] });
    }
  }
  for (const g of groups) g.tripName = mostCommon(g.plans.flatMap((p) => (p.tripName ? [p.tripName] : [])));
  return groups;
}

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The country a plan's location is in (see `locationCountry`). */
export const planCountry = (plan: Pick<TripitPlan, 'location'>): string | undefined => locationCountry(plan.location);

/** Where a group of plans went: the country of most of its stays, else of most of its plans of any kind. */
export function groupCountry(plans: TripitPlan[]): string | undefined {
  const tally = (list: TripitPlan[]) => mostCommon(list.flatMap((p) => planCountry(p) ?? []));
  return tally(plans.filter((p) => p.kind === 'lodging')) ?? tally(plans);
}

/** A new trip for a group: the trip name TripIt gave, else "Trip · Month Year". The place comes from the first stay. */
export function tripFromGroup(group: PlanGroup, now: string): Trip {
  const stay = group.plans.find((p) => p.kind === 'lodging' && p.location);
  return {
    id: `trip-${group.ref}`,
    name: group.tripName ?? `Trip · ${MONTHS[Number(group.start.slice(5, 7)) - 1]} ${group.start.slice(0, 4)}`,
    ...(stay?.location ? { destination: stay.location.slice(0, 80) } : {}),
    ...(groupCountry(group.plans) ? { country: groupCountry(group.plans) } : {}),
    startDate: group.start,
    endDate: group.end,
    itemIds: [],
    extras: [],
    packed: [],
    tripitRef: group.ref,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The trips to add for these plans. Never touches a trip that exists: a group is skipped when a trip already
 * carries its `tripitRef` (or any plan in it), when you deleted it (`dismissed`), or when one of your own trips
 * already covers some of its days (so a trip you made by hand isn't doubled).
 */
export function newTrips(plans: TripitPlan[], trips: Trip[], dismissed: readonly string[], now: string): Trip[] {
  const out: Trip[] = [];
  // Plans imported with a past trip already have their trip.
  for (const g of groupPlans(plans.filter((p) => !p.tripRef && !p.removed))) {
    const ids = new Set(g.plans.map((p) => p.id));
    const known = trips.some((t) => t.tripitRef && ids.has(t.tripitRef));
    const wasDeleted = dismissed.some((d) => ids.has(d));
    const overlaps = trips.some((t) => t.startDate <= g.end && t.endDate >= g.start);
    if (!known && !wasDeleted && !overlaps) out.push(tripFromGroup(g, now));
  }
  return out;
}

/** The plans that fall on a trip's days, in order (all-day ones first on each day). */
export function plansOfTrip(plans: TripitPlan[], trip: Pick<Trip, 'id' | 'startDate' | 'endDate'>): TripitPlan[] {
  return plans
    // Plans imported with a trip belong to it; feed plans belong to whichever trip covers their days.
    .filter((p) => (p.tripRef ? p.tripRef === trip.id : p.start <= trip.endDate && p.end >= trip.startDate))
    .sort((a, b) => a.start.localeCompare(b.start) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.id.localeCompare(b.id));
}
