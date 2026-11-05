// A trip's outfits are the calendar's own: a trip day's outfits are whatever the calendar has for that day, the
// pending `Plan`s (`plans` store) and the outfits worn on it. A trip has no copy of its own. Older trips kept
// them in `Trip.outfitPlan`; those entries still count until `legacyPlans()` has turned them into real plans.
// Pure.

import { wearsByDay } from '../clothes/calendar';
import { newPlan } from '../clothes/plans';
import type { ClothingItem, Outfit, Plan } from '../clothes/types';
import { tripDays } from './tripDays';
import type { Trip } from './types';

/** The outfits on each day of the trip, in plan order (worn ones after the planned ones). Days with none are left out. */
export function tripOutfitsByDay(trip: Trip, plans: Plan[], outfits: Outfit[]): Map<string, Outfit[]> {
  const byId = new Map(outfits.map((o) => [o.id, o]));
  const out = new Map<string, Outfit[]>();
  const add = (date: string, outfit: Outfit | undefined) => {
    if (!outfit) return;
    const list = out.get(date) ?? [];
    if (!list.some((o) => o.id === outfit.id)) out.set(date, [...list, outfit]);
  };
  const days = tripDays(trip);
  const inTrip = new Set(days);
  // Pending plans first (a worn outfit's plan is removed when it is logged, but a stray one is not shown twice).
  for (const p of [...plans].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (inTrip.has(p.date)) add(p.date, byId.get(p.outfitId));
  }
  for (const [date, ids] of Object.entries(trip.outfitPlan ?? {})) {
    if (inTrip.has(date)) for (const id of ids) add(date, byId.get(id));
  }
  for (const date of days) for (const o of outfits) if (o.wears.includes(date)) add(date, o);
  return out;
}

/**
 * Single pieces worn on each trip day, as the calendar groups them: worn on their own, not as part of an outfit
 * worn that day (those come with the outfit). Days with none are left out.
 */
export function tripWornItemsByDay(trip: Pick<Trip, 'startDate' | 'endDate'>, items: ClothingItem[], outfits: Outfit[]): Map<string, ClothingItem[]> {
  const worn = wearsByDay(items, outfits);
  const out = new Map<string, ClothingItem[]>();
  for (const date of tripDays(trip)) {
    const singles = worn.get(date)?.items ?? [];
    if (singles.length) out.set(date, singles);
  }
  return out;
}

/** Plans to create for outfits still kept in trips' own `outfitPlan`, skipping ones the calendar already has. */
export function legacyPlans(trips: Trip[], plans: Pick<Plan, 'id'>[]): Plan[] {
  const have = new Set(plans.map((p) => p.id));
  const out: Plan[] = [];
  for (const t of trips) {
    for (const [date, ids] of Object.entries(t.outfitPlan ?? {})) {
      for (const outfitId of ids) {
        const plan = newPlan(outfitId, date);
        if (!have.has(plan.id)) {
          have.add(plan.id);
          out.push(plan);
        }
      }
    }
  }
  return out;
}

/** Trips that still carry their own outfits. */
export const tripsWithLegacyOutfits = (trips: Trip[]): Trip[] => trips.filter((t) => Object.keys(t.outfitPlan ?? {}).length > 0);

/** What saving a day's choice changes: plans to add, ids of plans to remove, and the trip without its own entry for the day. */
export function dayChanges(
  trip: Trip,
  plans: Plan[],
  outfits: Outfit[],
  date: string,
  selected: string[],
): { add: Plan[]; remove: string[]; trip: Trip } {
  const shown = tripOutfitsByDay(trip, plans, outfits).get(date) ?? [];
  const have = new Set(shown.map((o) => o.id));
  const wanted = new Set(selected);
  const add = selected.filter((id) => !have.has(id)).map((id) => newPlan(id, date));
  // Only pending plans can be taken off: an outfit already worn that day stays worn.
  const remove = plans.filter((p) => p.date === date && !wanted.has(p.outfitId)).map((p) => p.id);
  // Legacy entries for the day are now plans (or were deselected), so the trip's own copy goes.
  const rest = { ...(trip.outfitPlan ?? {}) };
  delete rest[date];
  const changedTrip = trip.outfitPlan && date in trip.outfitPlan ? { ...trip, outfitPlan: rest, updatedAt: new Date().toISOString() } : trip;
  // A legacy entry that stays selected has to become a plan: it is gone from the trip now.
  const legacyKept = (trip.outfitPlan?.[date] ?? []).filter((id) => wanted.has(id) && !add.some((p) => p.outfitId === id) && !plans.some((p) => p.id === `${id}_${date}`));
  return { add: [...add, ...legacyKept.map((id) => newPlan(id, date))], remove, trip: changedTrip };
}
