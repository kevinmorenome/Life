import { addDays } from '../clothes/calendar';
import type { DayWear } from '../clothes/calendar';
import type { Checkin } from './types';

/** One place: Swarm's venue id when there is one, else the name in its city. */
export function venueKey(c: Checkin): string {
  return c.venueId ?? `${c.venue.toLowerCase()}|${(c.city ?? '').toLowerCase()}`;
}

const inPeriod = (c: Checkin, prefix: string) => c.date.startsWith(prefix);

export interface VenueRow {
  key: string;
  name: string;
  category?: string;
  city?: string;
  count: number;
  /** Distinct days, oldest first. */
  days: string[];
  first: string;
  last: string;
}

/** Most visited places first (ties: most recent). `prefix` limits to a year / month ('' = all time). */
export function topVenues(checkins: Checkin[], prefix = ''): VenueRow[] {
  const rows = new Map<string, VenueRow>();
  for (const c of [...checkins].sort((a, b) => a.at - b.at)) {
    if (!inPeriod(c, prefix)) continue;
    const key = venueKey(c);
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { key, name: c.venue, category: c.category, city: c.city, count: 0, days: [], first: c.date, last: c.date }));
    r.count++;
    r.last = c.date;
    r.name = c.venue;
    if (!r.days.includes(c.date)) r.days.push(c.date);
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
}

export interface CountRow {
  name: string;
  count: number;
}

const tally = (names: (string | undefined)[]): CountRow[] => {
  const counts = new Map<string, number>();
  for (const n of names) if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

export const topCategories = (checkins: Checkin[], prefix = ''): CountRow[] =>
  tally(checkins.filter((c) => inPeriod(c, prefix)).map((c) => c.category));

export const topCities = (checkins: Checkin[], prefix = ''): CountRow[] =>
  tally(checkins.filter((c) => inPeriod(c, prefix)).map((c) => c.city));

export const countryCount = (checkins: Checkin[], prefix = ''): number =>
  new Set(checkins.filter((c) => inPeriod(c, prefix) && c.country).map((c) => c.country)).size;

/** Check-ins per month for the `months` months ending with `month` (YYYY-MM), oldest first. */
export function monthlyCounts(checkins: Checkin[], month: string, months = 12): { month: string; count: number }[] {
  const out: { month: string; count: number }[] = [];
  let [y, m] = month.split('-').map(Number);
  for (let i = 0; i < months; i++) {
    out.unshift({ month: `${y}-${String(m).padStart(2, '0')}`, count: 0 });
    if (--m === 0) {
      m = 12;
      y--;
    }
  }
  const byMonth = new Map(out.map((o) => [o.month, o]));
  for (const c of checkins) {
    const o = byMonth.get(c.date.slice(0, 7));
    if (o) o.count++;
  }
  return out;
}

/** Check-ins per weekday, Monday first (7 entries). */
export function weekdayCounts(checkins: Checkin[], prefix = ''): number[] {
  const counts = Array<number>(7).fill(0);
  for (const c of checkins) {
    if (inPeriod(c, prefix)) counts[(new Date(c.date + 'T00:00:00Z').getUTCDay() + 6) % 7]++;
  }
  return counts;
}

/** Check-ins per hour of the day (24 entries), by the local time stored on each check-in. */
export function hourCounts(checkins: Checkin[], prefix = ''): number[] {
  const counts = Array<number>(24).fill(0);
  for (const c of checkins) {
    const h = Number(c.time.slice(0, 2));
    if (inPeriod(c, prefix) && h >= 0 && h < 24) counts[h]++;
  }
  return counts;
}

export interface NewVsRepeat {
  /** Places first visited in the period. */
  newPlaces: number;
  /** Every other check-in in the period: a place you'd already been, or another visit the same period. */
  repeats: number;
  /** Check-ins in the period. */
  total: number;
}

export function newVsRepeat(checkins: Checkin[], prefix = ''): NewVsRepeat {
  const firstSeen = new Map<string, string>();
  for (const c of checkins) {
    const k = venueKey(c);
    const seen = firstSeen.get(k);
    if (seen === undefined || c.date < seen) firstSeen.set(k, c.date);
  }
  let newPlaces = 0;
  for (const d of firstSeen.values()) if (d.startsWith(prefix)) newPlaces++;
  const inRange = checkins.filter((c) => inPeriod(c, prefix));
  return { newPlaces, repeats: inRange.length - newPlaces, total: inRange.length };
}

export interface DayStreak {
  current: number;
  longest: number;
}

/** Days in a row with at least one check-in. The current run still counts if its last day is yesterday. */
export function checkinStreak(checkins: Checkin[], now: string): DayStreak {
  const days = [...new Set(checkins.map((c) => c.date))].sort();
  let longest = 0;
  let run = 0;
  let prev = '';
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  const alive = prev === now || prev === addDays(now, -1);
  return { current: alive ? run : 0, longest };
}

export interface WornHere {
  outfits: { id: string; name?: string; count: number }[];
  /** Pieces worn on those days outside any outfit worn that day. */
  items: { id: string; name: string; count: number }[];
}

/** What was worn on the days you checked in somewhere: outfits and loose pieces, most often first. */
export function wornOnDays(days: string[], wears: Map<string, DayWear>): WornHere {
  const outfits = new Map<string, { id: string; name?: string; count: number }>();
  const items = new Map<string, { id: string; name: string; count: number }>();
  for (const d of days) {
    const w = wears.get(d);
    if (!w) continue;
    for (const o of w.outfits) {
      const e = outfits.get(o.id) ?? { id: o.id, name: o.name, count: 0 };
      e.count++;
      outfits.set(o.id, e);
    }
    for (const i of w.items) {
      const e = items.get(i.id) ?? { id: i.id, name: i.name, count: 0 };
      e.count++;
      items.set(i.id, e);
    }
  }
  const byCount = <T extends { count: number }>(m: Map<string, T>) => [...m.values()].sort((a, b) => b.count - a.count);
  return { outfits: byCount(outfits), items: byCount(items) };
}
