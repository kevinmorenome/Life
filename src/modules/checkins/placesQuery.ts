import { venueKey } from './placeStats';
import type { Checkin } from './types';

/** What the place questions need of a check-in (the MCP tools read only these fields from D1). */
export type PlaceCheckin = Pick<Checkin, 'id' | 'venue' | 'date' | 'time' | 'source'> &
  Partial<Pick<Checkin, 'venueId' | 'category' | 'city' | 'country' | 'shout'>>;

export interface PlaceFilter {
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
  /** Words that must all appear in the venue, category, city or note. */
  query?: string;
  /** Contains, ignoring case. */
  category?: string;
  city?: string;
  country?: string;
}

const lower = (s: string | undefined) => (s ?? '').toLowerCase();

/** The check-ins that satisfy every filter given. */
export function filterCheckins<T extends PlaceCheckin>(list: T[], f: PlaceFilter): T[] {
  const words = lower(f.query).split(/\s+/).filter(Boolean);
  return list.filter((c) => {
    if (f.from && c.date < f.from) return false;
    if (f.to && c.date > f.to) return false;
    if (f.category && !lower(c.category).includes(lower(f.category))) return false;
    if (f.city && !lower(c.city).includes(lower(f.city))) return false;
    if (f.country && !lower(c.country).includes(lower(f.country))) return false;
    if (words.length) {
      const hay = [c.venue, c.category, c.city, c.shout].map(lower).join(' ');
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

/** Newest day first, and within a day the latest time first (check-ins with no time last). */
export function newestFirst<T extends PlaceCheckin>(list: T[]): T[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '') || a.id.localeCompare(b.id));
}

export interface VenueHistory {
  name: string;
  category?: string;
  city?: string;
  country?: string;
  /** Check-ins at this place. */
  visits: number;
  /** Distinct days, oldest first. */
  days: string[];
  first: string;
  last: string;
}

/** One row per place (Swarm's venue id, else name + city), the most recently visited first. */
export function venueHistory(list: PlaceCheckin[]): VenueHistory[] {
  const rows = new Map<string, VenueHistory>();
  for (const c of [...list].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))) {
    const key = venueKey(c);
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { name: c.venue, category: c.category, city: c.city, country: c.country, visits: 0, days: [], first: c.date, last: c.date }));
    r.visits++;
    r.last = c.date;
    r.name = c.venue;
    if (r.days[r.days.length - 1] !== c.date) r.days.push(c.date);
  }
  return [...rows.values()].sort((a, b) => b.last.localeCompare(a.last) || b.visits - a.visits);
}
