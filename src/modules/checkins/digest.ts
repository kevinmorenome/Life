import { addDays } from '../clothes/calendar';
import { formatDuration, toMinutes, type DayInfo } from '../work/work';
import { venueKey } from './placeStats';
import type { PlaceCheckin } from './placesQuery';

/** What was worn on a day, as names. */
export interface WornNames {
  outfits: string[];
  /** Pieces worn outside any outfit that day. */
  items: string[];
}

export interface DigestInput {
  checkins: PlaceCheckin[];
  worn: Map<string, WornNames>;
  /** From `buildDays()`: what is known of each work day. */
  days: Map<string, DayInfo>;
  /** YYYY-MM-DD, inclusive. */
  start: string;
  end: string;
}

export interface NamedCount {
  name: string;
  times: number;
}

export interface Digest {
  period: { start: string; end: string; days: number };
  places: {
    checkins: number;
    /** Check-ins in the period before this one, of the same length. */
    previousCheckins: number;
    distinctPlaces: number;
    daysOut: number;
    /** Places whose first check-in ever fell in the period. */
    newPlaces: { name: string; city?: string; category?: string; date: string }[];
    topPlaces: { name: string; city?: string; visits: number }[];
    cities: string[];
    countries: string[];
  };
  outfits: {
    daysLogged: number;
    notLogged: string[];
    outfits: NamedCount[];
    loosePieces: NamedCount[];
    byDay: { date: string; outfits: string[]; items: string[] }[];
  };
  work: {
    officeDays: number;
    homeDays: number;
    tripDays: number;
    offDays: number;
    previousOfficeDays: number;
    /** Average time between arriving and leaving on office days with both times, e.g. "8h 12m". */
    averageAtOffice?: string;
  };
}

/** Every date from `start` to `end`, inclusive (empty when `end` is before `start`). */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

const inRange = <T extends { date: string }>(list: T[], start: string, end: string) => list.filter((c) => c.date >= start && c.date <= end);

function tally(names: string[]): NamedCount[] {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([name, times]) => ({ name, times })).sort((a, b) => b.times - a.times || a.name.localeCompare(b.name));
}

const countStatus = (days: Map<string, DayInfo>, dates: string[], status: string) => dates.filter((d) => days.get(d)?.status === status).length;

/** A summary of one stretch of days: where you went, what you wore and how you worked. Pure, so it is easy to test. */
export function buildDigest({ checkins, worn, days, start, end }: DigestInput): Digest {
  const dates = datesBetween(start, end);
  const length = dates.length;
  const previousStart = addDays(start, -length);
  const previousEnd = addDays(start, -1);

  const mine = inRange(checkins, start, end);
  const first = new Map<string, PlaceCheckin>();
  for (const c of [...checkins].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))) {
    const k = venueKey(c);
    if (!first.has(k)) first.set(k, c);
  }
  const visits = new Map<string, { name: string; city?: string; visits: number }>();
  for (const c of mine) {
    const k = venueKey(c);
    const v = visits.get(k) ?? { name: c.venue, city: c.city, visits: 0 };
    v.visits++;
    visits.set(k, v);
  }
  const unique = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

  const wornDays = dates.filter((d) => {
    const w = worn.get(d);
    return w && (w.outfits.length || w.items.length);
  });
  const notLogged = dates.filter((d) => !wornDays.includes(d));

  const atOffice = dates.filter((d) => days.get(d)?.status === 'office');
  const spans = atOffice.flatMap((d) => {
    const i = days.get(d);
    if (!i?.arrive || !i.leave) return [];
    const span = toMinutes(i.leave) - toMinutes(i.arrive);
    return span > 0 ? [span] : [];
  });
  const previous = datesBetween(previousStart, previousEnd);

  return {
    period: { start, end, days: length },
    places: {
      checkins: mine.length,
      previousCheckins: inRange(checkins, previousStart, previousEnd).length,
      distinctPlaces: visits.size,
      daysOut: new Set(mine.map((c) => c.date)).size,
      newPlaces: [...first.values()]
        .filter((c) => c.date >= start && c.date <= end)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((c) => ({ name: c.venue, ...(c.city ? { city: c.city } : {}), ...(c.category ? { category: c.category } : {}), date: c.date })),
      topPlaces: [...visits.values()].sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name)).slice(0, 5),
      cities: unique(mine.map((c) => c.city)),
      countries: unique(mine.map((c) => c.country)),
    },
    outfits: {
      daysLogged: wornDays.length,
      notLogged,
      outfits: tally(dates.flatMap((d) => worn.get(d)?.outfits ?? [])).slice(0, 5),
      loosePieces: tally(dates.flatMap((d) => worn.get(d)?.items ?? [])).slice(0, 5),
      byDay: wornDays.map((d) => ({ date: d, outfits: worn.get(d)!.outfits, items: worn.get(d)!.items })),
    },
    work: {
      officeDays: atOffice.length,
      homeDays: countStatus(days, dates, 'home'),
      tripDays: countStatus(days, dates, 'trip'),
      offDays: countStatus(days, dates, 'off'),
      previousOfficeDays: countStatus(days, previous, 'office'),
      ...(spans.length ? { averageAtOffice: formatDuration(spans.reduce((a, b) => a + b, 0) / spans.length) } : {}),
    },
  };
}
