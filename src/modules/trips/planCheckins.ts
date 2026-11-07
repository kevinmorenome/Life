// Itinerary plans as check-ins. Every plan that took you somewhere becomes a check-in record, shaped like a Swarm one
// (so the calendar, Places stats and countries read them the same way): a flight gives two (where it left and where
// it landed), anything else one, on its first day. A real Swarm check-in wins: a plan's check-in is left out when
// Swarm already has one in the same country (and city, when both say) that day. Plans of today and later wait until the day is over. A removed plan has none.
// Pure: `planCheckinChanges` says what to add and what to delete; `syncPlanCheckins` (planCheckinsRunner.ts) applies it.

import type { PlanKind, TripitPlan } from '../../../worker/tripitTypes';
import type { Checkin } from '../checkins/types';
import { countryByCode, locationCountry } from '../countries/countries';

type PlanLike = Pick<TripitPlan, 'id' | 'kind' | 'title' | 'start' | 'startTime' | 'end' | 'endTime' | 'location' | 'stops' | 'removed'>;

const CATEGORY: Record<PlanKind, string> = {
  flight: 'Airport',
  lodging: 'Hotel',
  transit: 'Train Station',
  car: 'Car Rental',
  meal: 'Restaurant',
  activity: 'Attraction',
  other: 'Other',
};

const epoch = (date: string, time: string, plus = 0): number => Math.floor(Date.parse(`${date}T${time}:00Z`) / 1000) + plus;

export interface Draft {
  id: string;
  venue: string;
  category: string;
  city?: string;
  country?: string;
  date: string;
  time: string;
  at: number;
}

/** The check-ins one plan stands for (before comparing with Swarm's). */
export function draftsOfPlan(plan: PlanLike): Draft[] {
  if (plan.removed) return [];
  const name = (code?: string) => (code ? countryByCode(code)?.name : undefined);
  if (plan.kind === 'flight') {
    const m = /^(\S+) → (\S+)/.exec(plan.title);
    const cities = (plan.location ?? '').split(' → ').map((s) => s.trim());
    const stops = plan.stops ?? [];
    const distinct = plan.start !== plan.end;
    let depCountry: string | undefined;
    let arrCountry: string | undefined;
    if (stops.length >= 2) [depCountry, arrCountry] = [stops[0].country, stops[1].country];
    else if (stops.length === 1 && distinct) {
      if (stops[0].date === plan.start) depCountry = stops[0].country;
      else if (stops[0].date === plan.end) arrCountry = stops[0].country;
    }
    const leg = (suffix: string, code: string | undefined, city: string | undefined, country: string | undefined, date: string, time: string, plus: number): Draft => ({
      id: `plan-${plan.id}-${suffix}`,
      venue: city && city !== code ? `${city} Airport${code ? ` (${code})` : ''}` : `${code ?? 'Airport'} Airport`,
      category: CATEGORY.flight,
      ...(city && city !== code ? { city } : {}),
      ...(name(country) ? { country: name(country) } : {}),
      date,
      time,
      at: epoch(date, time, plus),
    });
    return [
      leg('dep', m?.[1], cities[0], depCountry, plan.start, plan.startTime ?? '12:00', 0),
      leg('arr', m?.[2], cities[1], arrCountry, plan.end, plan.endTime ?? '12:00', 60),
    ];
  }
  const code = plan.stops?.[0]?.country ?? locationCountry(plan.location);
  const city = plan.location?.split(',')[0]?.trim();
  const time = plan.startTime ?? '12:00';
  return [
    {
      id: `plan-${plan.id}`,
      venue: plan.title,
      category: CATEGORY[plan.kind],
      ...(city ? { city } : {}),
      ...(name(code) ? { country: name(code) } : {}),
      date: plan.start,
      time,
      at: epoch(plan.start, time),
    },
  ];
}

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Whether a Swarm check-in already covers the same place that day: one with the same name (whatever else it says), or
 * one in the same country (and city, when both say).
 */
export function coveredBySwarm(d: Draft, swarm: Pick<Checkin, 'date' | 'country' | 'city' | 'venue'>[]): boolean {
  return swarm.some(
    (c) =>
      c.date === d.date &&
      ((norm(c.venue) !== '' && norm(c.venue) === norm(d.venue)) ||
        (!!d.country && norm(c.country) === norm(d.country) && (!c.city || !d.city || norm(c.city) === norm(d.city)))),
  );
}

/**
 * What to change so the plan-made check-ins match the plans: new ones to add, and the ids of ones to delete (their
 * plan was removed, or Swarm has the place now). Existing ones are never rewritten.
 */
export function planCheckinChanges(plans: PlanLike[], checkins: Checkin[], today: string, now = new Date().toISOString()): { add: Checkin[]; remove: string[] } {
  const swarm = checkins.filter((c) => c.source !== 'plan');
  const existing = new Map(checkins.filter((c) => c.source === 'plan').map((c) => [c.id, c]));
  const wanted = new Set<string>();
  const add: Checkin[] = [];
  for (const plan of plans) {
    for (const d of draftsOfPlan(plan)) {
      // A plan of today or later is no check-in (and not a visit) yet: it may not be time, and you may check in with
      // Swarm. It appears the day after.
      if (d.date >= today || coveredBySwarm(d, swarm)) continue;
      wanted.add(d.id);
      if (existing.has(d.id)) continue;
      add.push({ ...d, source: 'plan', createdAt: now, updatedAt: now });
    }
  }
  return { add, remove: [...existing.keys()].filter((id) => !wanted.has(id)) };
}

/**
 * The plans still ahead on one day (today or later; earlier days have real check-ins), as check-in-shaped drafts for the
 * day screen. Left out when Swarm already has a check-in for the place that day, so nothing shows twice.
 */
export function plannedOnDay(plans: PlanLike[], checkins: Pick<Checkin, 'date' | 'country' | 'city' | 'venue' | 'source'>[], date: string, today: string): Draft[] {
  if (date < today) return [];
  const swarm = checkins.filter((c) => c.source !== 'plan');
  return plans.flatMap(draftsOfPlan).filter((d) => d.date === date && !coveredBySwarm(d, swarm)).sort((a, b) => a.at - b.at);
}
