import { addDays } from '../clothes/calendar';
import { newVsRepeat, topCategories, topCities, topVenues, type CountRow, type VenueRow } from './placeStats';
import type { Checkin } from './types';

/** What the closet adds: pieces and outfits with their dated wears. */
export interface Wearable {
  id: string;
  name?: string;
  wears: string[];
}

export interface WornRow {
  id: string;
  name: string;
  count: number;
}

export interface YearReview {
  year: string;
  checkins: number;
  places: number;
  newPlaces: number;
  /** Days with at least one check-in. */
  daysOut: number;
  topVenues: VenueRow[];
  categories: CountRow[];
  cities: CountRow[];
  countries: string[];
  /** Countries whose first check-in ever was this year. */
  newCountries: string[];
  busiestMonth?: { month: string; count: number };
  busiestDay?: { date: string; count: number };
  longestStreak: { days: number; start?: string; end?: string };
  mostWornPieces: WornRow[];
  mostWornOutfits: WornRow[];
}

/** Years that have check-ins or wears, newest first. */
export function reviewYears(checkins: Checkin[], wearables: Wearable[] = []): string[] {
  const years = new Set<string>();
  for (const c of checkins) years.add(c.date.slice(0, 4));
  for (const w of wearables) for (const d of w.wears) years.add(d.slice(0, 4));
  return [...years].filter((y) => /^\d{4}$/.test(y)).sort().reverse();
}

/** The longest run of consecutive days in a sorted list of distinct dates. The earliest wins a tie. */
export function longestRun(days: string[]): { days: number; start?: string; end?: string } {
  let best = { days: 0 } as { days: number; start?: string; end?: string };
  let runStart = '';
  let run = 0;
  let prev = '';
  for (const d of days) {
    if (prev && addDays(prev, 1) === d) run++;
    else {
      run = 1;
      runStart = d;
    }
    if (run > best.days) best = { days: run, start: runStart, end: d };
    prev = d;
  }
  return best;
}

function mostWorn(list: Wearable[], year: string, limit: number): WornRow[] {
  return list
    .map((w) => ({ id: w.id, name: w.name || 'Unnamed', count: new Set(w.wears.filter((d) => d.startsWith(year))).size }))
    .filter((w) => w.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** A year of places, plus the pieces and outfits worn most. `year` is YYYY. */
export function yearReview(checkins: Checkin[], year: string, pieces: Wearable[] = [], outfits: Wearable[] = []): YearReview {
  const inYear = checkins.filter((c) => c.date.startsWith(year));
  const fresh = newVsRepeat(checkins, year);

  const firstCountry = new Map<string, string>();
  for (const c of checkins) {
    if (!c.country) continue;
    const seen = firstCountry.get(c.country);
    if (seen === undefined || c.date < seen) firstCountry.set(c.country, c.date);
  }

  const perMonth = new Map<string, number>();
  const perDay = new Map<string, number>();
  for (const c of inYear) {
    perMonth.set(c.date.slice(0, 7), (perMonth.get(c.date.slice(0, 7)) ?? 0) + 1);
    perDay.set(c.date, (perDay.get(c.date) ?? 0) + 1);
  }
  const best = <K extends string>(m: Map<string, number>, key: K) => {
    const top = [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return top ? ({ [key]: top[0], count: top[1] } as { [P in K]: string } & { count: number }) : undefined;
  };

  const venues = topVenues(checkins, year);
  return {
    year,
    checkins: inYear.length,
    places: venues.length,
    newPlaces: fresh.newPlaces,
    daysOut: perDay.size,
    topVenues: venues.slice(0, 5),
    categories: topCategories(checkins, year).slice(0, 5),
    cities: topCities(checkins, year).slice(0, 5),
    countries: [...new Set(inYear.map((c) => c.country).filter((c): c is string => !!c))].sort(),
    newCountries: [...firstCountry].filter(([, d]) => d.startsWith(year)).map(([c]) => c).sort(),
    busiestMonth: best(perMonth, 'month'),
    busiestDay: best(perDay, 'date'),
    longestStreak: longestRun([...perDay.keys()].sort()),
    mostWornPieces: mostWorn(pieces, year, 5),
    mostWornOutfits: mostWorn(outfits, year, 5),
  };
}
