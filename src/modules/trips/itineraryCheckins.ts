import type { TripitPlan } from '../../../worker/tripitTypes';
import { NO_PLAN, type Checkin } from '../checkins/types';

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

/** Key of `ItineraryCheckins.matched`: a plan on one day. */
export const matchKey = (plan: Pick<TripitPlan, 'id'>, day: string): string => `${plan.id}|${day}`;

export interface ItineraryCheckins {
  /** Check-ins of the trip's days with no plan of the same name that day, by day (oldest first). */
  extra: Map<string, Checkin[]>;
  /** For a plan on one of its days (`matchKey`), the Swarm check-in that is the same place: shown on the plan, not twice. */
  matched: Map<string, Checkin>;
}

/**
 * The Swarm check-ins of a trip's days for its Itinerary, without duplicates. A check-in the app made from a plan is
 * the plan itself, so it is left out. A Swarm one that names the same place as a plan of that day is folded into the
 * plan (`matched`), anything else is listed on its own (`extra`). A check-in merged with a plan by hand (`planRef`) is that
 * plan's whatever its name, and one marked `NO_PLAN` is never folded.
 */
export function itineraryCheckins(plans: TripitPlan[], checkins: Checkin[], startDate: string, endDate: string): ItineraryCheckins {
  const extra = new Map<string, Checkin[]>();
  const matched = new Map<string, Checkin>();
  const covers = (p: TripitPlan, date: string) => !p.removed && p.start <= date && p.end >= date;
  const swarm = checkins.filter((c) => c.source === 'swarm' && c.date >= startDate && c.date <= endDate);
  // A check-in you merged with a plan by hand is that plan's (and goes first); one you separated is never folded; the rest are matched by name.
  const manual = (c: Checkin) => (c.planRef && c.planRef !== NO_PLAN ? plans.find((p) => p.id === c.planRef && covers(p, c.date)) : undefined);
  const ordered = [...swarm].sort((a, b) => Number(!!manual(b)) - Number(!!manual(a)) || a.at - b.at);
  for (const c of ordered) {
    const plan = manual(c) ?? (c.planRef === NO_PLAN ? undefined : plans.find((p) => covers(p, c.date) && sameName(c.venue, p.title)));
    // The first check-in of a place that day is folded into its plan; another one at the same place is listed, never hidden.
    if (plan && !matched.has(matchKey(plan, c.date))) {
      matched.set(matchKey(plan, c.date), c);
      continue;
    }
    const list = extra.get(c.date);
    if (list) list.push(c);
    else extra.set(c.date, [c]);
  }
  for (const list of extra.values()) list.sort((a, b) => a.at - b.at);
  return { extra, matched };
}
