import { NO_PLAN, type Checkin } from './types';

/** Check-ins grouped by local date, each day oldest first. */
export function byDate(checkins: Checkin[]): Map<string, Checkin[]> {
  const days = new Map<string, Checkin[]>();
  for (const c of [...checkins].sort((a, b) => a.at - b.at)) {
    const list = days.get(c.date);
    if (list) list.push(c);
    else days.set(c.date, [c]);
  }
  return days;
}

/** Short label for a day's mark: the venue, or how many places when there were several. */
export function dayLabel(list: Checkin[]): string {
  return list.length === 1 ? list[0].venue : `${list.length} places`;
}

/** "Café Nero · London" style second line. */
export function place(c: Pick<Checkin, 'category' | 'city'>): string {
  return [c.category, c.city].filter(Boolean).join(' · ');
}

/** Without a time, a check-in sits at midday, so it stays within its day and orders after the morning ones. */
const clock = (date: string, time: string): number => Date.parse(`${date}T${time || '12:00'}:00Z`) / 1000;

/**
 * The check-in moved to another day and time, for a Swarm one that was logged on the wrong day. The time can be
 * left empty when it isn't known (`time` ''). `at` shifts by the same amount as the local clock (it orders
 * check-ins across days), the place stays. Returns the same record when nothing changed or the input isn't a
 * date and a time (or empty).
 */
export function moveCheckin(c: Checkin, date: string, time: string, now: string): Checkin {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(time === '' || /^\d{2}:\d{2}$/.test(time))) return c;
  if (date === c.date && time === c.time) return c;
  const shift = clock(date, time) - clock(c.date, c.time);
  if (!Number.isFinite(shift)) return c;
  return { ...c, date, time, at: c.at + shift, updatedAt: now };
}

/** The check-ins with these ids moved to `date`, each keeping its own time. Only the ones that actually change are returned. */
export function moveCheckins(checkins: Checkin[], ids: ReadonlySet<string>, date: string, now: string): Checkin[] {
  return checkins
    .filter((c) => ids.has(c.id) && c.source === 'swarm')
    .map((c) => ({ before: c, after: moveCheckin(c, date, c.time, now) }))
    .filter((m) => m.after !== m.before)
    .map((m) => m.after);
}

/**
 * Two check-ins of the same day that are the same visit, as one: the Swarm one is kept (else the one with a time,
 * else the first), and whatever it lacks (time, category, city, country, position, note) is filled in from the
 * other, which is dropped. Returns `null` for two that aren't on the same day.
 */
export function mergeCheckins(a: Checkin, b: Checkin, now: string): { keep: Checkin; drop: Checkin } | null {
  if (a.date !== b.date || a.id === b.id) return null;
  const rank = (c: Checkin) => (c.source === 'swarm' ? 2 : 0) + (c.time ? 1 : 0);
  const [keep, drop] = rank(b) > rank(a) ? [b, a] : [a, b];
  const fill = <K extends keyof Checkin>(k: K) => (keep[k] === undefined || keep[k] === '' ? { [k]: drop[k] } : {});
  const filled: Checkin = { ...keep, ...fill('venueId'), ...fill('category'), ...fill('city'), ...fill('country'), ...fill('lat'), ...fill('lng'), ...fill('shout') };
  const merged = keep.time || !drop.time ? filled : moveCheckin(filled, keep.date, drop.time, now);
  const changed = JSON.stringify(merged) !== JSON.stringify(keep) || merged !== filled;
  return { keep: changed ? { ...merged, updatedAt: now } : keep, drop };
}

/** The check-in merged with a TripIt plan by hand: the Itinerary and the day screen show the two as one row. */
export function linkToPlan(c: Checkin, planId: string, now: string): Checkin {
  return { ...c, planRef: planId, updatedAt: now };
}

/** The check-in kept apart from the plan it was folded into (by hand or because the names match). */
export function unlinkFromPlan(c: Checkin, now: string): Checkin {
  return { ...c, planRef: NO_PLAN, updatedAt: now };
}
