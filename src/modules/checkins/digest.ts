import { addDays } from '../clothes/calendar';
import { formatDuration, toMinutes, type DayInfo } from '../work/work';
import { placeName, round2 } from '../wolt/wolt';
import { venueKey } from './placeStats';
import type { PlaceCheckin } from './placesQuery';

/** What was worn on a day, as names. */
export interface WornNames {
  outfits: string[];
  /** Pieces worn outside any outfit that day. */
  items: string[];
}

/** What the other modules add, already reduced to what the digest needs. Anything left out is simply not summarised. */
export interface DigestExtras {
  takeout?: { date: string; place: string; total: number; currency: string }[];
  rides?: { date: string; fare: number; currency: string }[];
  groceries?: { date: string; store: string; total: number }[];
  watched?: { date: string; title: string; kind: 'movie' | 'episode' }[];
  music?: { date: string; plays: number; ms: number; artists?: { name: string; plays: number }[] }[];
  /** One entry per game played (a match), with the game's name. */
  games?: { date: string; game: string }[];
}

export interface DigestInput extends DigestExtras {
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
  /** Only the parts that have something in the period. */
  other: {
    takeout?: { orders: number; spentEur: number; otherCurrencyOrders: number; places: NamedCount[] };
    rides?: { rides: number; spentEur: number; otherCurrencyRides: number };
    groceries?: { receipts: number; spent: number; stores: NamedCount[] };
    watching?: { plays: number; movies: number; episodes: number; top: NamedCount[] };
    music?: { plays: number; hours: number; daysWithMusic: number; topArtists: NamedCount[] };
    games?: { games: number; days: number; titles: NamedCount[] };
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
export function buildDigest({ checkins, worn, days, start, end, ...extras }: DigestInput): Digest {
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
    other: otherSections(extras, start, end),
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

const EUR = 'EUR';

/** The other modules' numbers for the period; a module with nothing in it is left out. */
function otherSections(x: DigestExtras, start: string, end: string): Digest['other'] {
  const out: Digest['other'] = {};

  const orders = inRange(x.takeout ?? [], start, end);
  if (orders.length) {
    const euro = orders.filter((o) => o.currency === EUR);
    out.takeout = { orders: orders.length, spentEur: round2(euro.reduce((a, o) => a + o.total, 0)), otherCurrencyOrders: orders.length - euro.length, places: tally(orders.map((o) => placeName(o.place))).slice(0, 3) };
  }

  const rides = inRange(x.rides ?? [], start, end);
  if (rides.length) {
    const euro = rides.filter((r) => r.currency === EUR);
    out.rides = { rides: rides.length, spentEur: round2(euro.reduce((a, r) => a + r.fare, 0)), otherCurrencyRides: rides.length - euro.length };
  }

  const receipts = inRange(x.groceries ?? [], start, end);
  if (receipts.length) out.groceries = { receipts: receipts.length, spent: round2(receipts.reduce((a, r) => a + r.total, 0)), stores: tally(receipts.map((r) => r.store)).slice(0, 3) };

  const plays = inRange(x.watched ?? [], start, end);
  if (plays.length) {
    const movies = plays.filter((p) => p.kind === 'movie').length;
    out.watching = { plays: plays.length, movies, episodes: plays.length - movies, top: tally(plays.map((p) => p.title)).slice(0, 3) };
  }

  const listened = inRange(x.music ?? [], start, end).filter((d) => d.plays > 0);
  if (listened.length) {
    const artists = new Map<string, number>();
    for (const d of listened) for (const a of d.artists ?? []) artists.set(a.name, (artists.get(a.name) ?? 0) + a.plays);
    out.music = {
      plays: listened.reduce((a, d) => a + d.plays, 0),
      hours: Math.round((listened.reduce((a, d) => a + d.ms, 0) / 3_600_000) * 10) / 10,
      daysWithMusic: listened.length,
      topArtists: [...artists].map(([name, times]) => ({ name, times })).sort((a, b) => b.times - a.times || a.name.localeCompare(b.name)).slice(0, 3),
    };
  }

  const games = inRange(x.games ?? [], start, end);
  if (games.length) out.games = { games: games.length, days: new Set(games.map((g) => g.date)).size, titles: tally(games.map((g) => g.game)).slice(0, 3) };

  return out;
}
