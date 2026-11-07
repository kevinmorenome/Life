import type { TripitPlan } from '../../../worker/tripitTypes';
import type { Checkin } from '../checkins/types';

const norm = (s: string | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Whether a check-in and a plan are the same place: the same name, or one name inside the other (at least 4 letters). */
export function sameName(venue: string, title: string): boolean {
  const a = norm(venue);
  const b = norm(title);
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && (` ${long} `).includes(` ${short} `);
}

export interface ItineraryCheckins {
  /** Check-ins of the trip's days with no plan of the same name that day, by day (oldest first). */
  extra: Map<string, Checkin[]>;
  /** For a plan, the Swarm check-in that is the same place on a day it covers: shown on the plan, not twice. */
  matched: Map<string, Checkin>;
}

/**
 * The Swarm check-ins of a trip's days for its Itinerary, without duplicates. A check-in the app made from a plan is
 * the plan itself, so it is left out. A Swarm one that names the same place as a plan of that day is folded into the
 * plan (`matched`), anything else is listed on its own (`extra`).
 */
export function itineraryCheckins(plans: TripitPlan[], checkins: Checkin[], startDate: string, endDate: string): ItineraryCheckins {
  const extra = new Map<string, Checkin[]>();
  const matched = new Map<string, Checkin>();
  const swarm = checkins.filter((c) => c.source === 'swarm' && c.date >= startDate && c.date <= endDate).sort((a, b) => a.at - b.at);
  for (const c of swarm) {
    const plan = plans.find((p) => !p.removed && p.start <= c.date && p.end >= c.date && sameName(c.venue, p.title));
    if (plan) {
      if (!matched.has(plan.id)) matched.set(plan.id, c);
      continue;
    }
    const list = extra.get(c.date);
    if (list) list.push(c);
    else extra.set(c.date, [c]);
  }
  return { extra, matched };
}
