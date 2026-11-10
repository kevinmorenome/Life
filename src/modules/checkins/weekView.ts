import type { Digest, DigestDay } from './digest';

/** A colour in the calendar's palette (`--c-<tone>`), and what it stands for. */
export interface DayDot {
  key: string;
  tone: string;
  label: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const WORK_LABELS: Record<string, string> = { office: 'Office day', home: 'Home day', trip: 'Business trip', off: 'Day off' };

/** The kinds of things that happened on a day, one dot each, in a fixed order. */
export function dayDots(d: DigestDay): DayDot[] {
  const dots: DayDot[] = [];
  if (d.work) dots.push({ key: 'work', tone: d.work, label: WORK_LABELS[d.work] ?? 'Work' });
  if (d.checkins) dots.push({ key: 'places', tone: 'place', label: plural(d.checkins, 'check-in') });
  if (d.worn) dots.push({ key: 'outfit', tone: 'accent', label: 'Outfit logged' });
  if (d.takeout) dots.push({ key: 'takeout', tone: 'wolt', label: plural(d.takeout, 'takeout order') });
  if (d.rides) dots.push({ key: 'rides', tone: 'rides', label: plural(d.rides, 'ride') });
  if (d.groceries) dots.push({ key: 'groceries', tone: 'food', label: plural(d.groceries, 'grocery receipt') });
  if (d.watched) dots.push({ key: 'watching', tone: 'watch', label: plural(d.watched, 'play') });
  if (d.listened) dots.push({ key: 'music', tone: 'music', label: 'Music' });
  if (d.games) dots.push({ key: 'games', tone: 'games', label: plural(d.games, 'game') });
  return dots;
}

/** What each dot kind is called in the legend. */
export const DOT_NAMES: Record<string, string> = { work: 'Work', places: 'Places', outfit: 'Outfit', takeout: 'Takeout', rides: 'Rides', groceries: 'Groceries', watching: 'Watching', music: 'Music', games: 'Games' };

/** The colour of a dot: the calendar's `--c-<tone>` colours, the accent for outfits. */
export const dotColor = (tone: string): string => (tone === 'accent' ? 'var(--accent)' : `var(--c-${tone})`);

export interface WeekTile {
  key: string;
  value: string;
  label: string;
  /** "+3 vs last week", never colour alone. */
  delta?: string;
  tone: number;
}

/** "+3 vs last week" / "−2 vs last week" / "same as last week"; nothing when both weeks are empty. */
export function deltaText(now: number, before: number, format: (n: number) => string = String): string | undefined {
  if (now === 0 && before === 0) return undefined;
  const diff = Math.round((now - before) * 100) / 100;
  if (diff === 0) return 'same as last week';
  return `${diff > 0 ? '+' : '−'}${format(Math.abs(diff))} vs last week`;
}

/** What the digest spent in euro on takeout, rides and groceries together. */
export const spentOf = (d: Digest): number => Math.round(((d.other.takeout?.spentEur ?? 0) + (d.other.rides?.spentEur ?? 0) + (d.other.groceries?.spent ?? 0)) * 100) / 100;

/** The headline numbers of a week, each set against the week before. A number that is 0 both weeks is left out. */
export function weekTiles(cur: Digest, prev: Digest, money: (n: number) => string): WeekTile[] {
  const rows: { key: string; label: string; now: number; before: number; tone: number; format?: (n: number) => string }[] = [
    { key: 'checkins', label: 'check-ins', now: cur.places.checkins, before: prev.places.checkins, tone: 0 },
    { key: 'new', label: 'new places', now: cur.places.newPlaces.length, before: prev.places.newPlaces.length, tone: 2 },
    { key: 'office', label: 'office days', now: cur.work.officeDays, before: prev.work.officeDays, tone: 1 },
    { key: 'spent', label: 'on takeout, rides and groceries', now: spentOf(cur), before: spentOf(prev), tone: 3, format: money },
    { key: 'music', label: 'hours of music', now: cur.other.music?.hours ?? 0, before: prev.other.music?.hours ?? 0, tone: 4 },
    { key: 'watching', label: 'plays watched', now: cur.other.watching?.plays ?? 0, before: prev.other.watching?.plays ?? 0, tone: 1 },
  ];
  return rows
    .filter((r) => r.now > 0 || r.before > 0)
    .map((r) => ({ key: r.key, value: (r.format ?? String)(r.now), label: r.label, delta: deltaText(r.now, r.before, r.format), tone: r.tone }));
}

export interface Highlight {
  key: string;
  text: string;
  /** A day to open on tap. */
  date?: string;
}

const entries = (d: DigestDay) => d.checkins + d.takeout + d.rides + d.groceries + d.watched + d.games;

/** A few sentences about the week: the busiest day, new places, days to catch up on, what you kept coming back to. */
export function weekHighlights(d: Digest, weekday: (date: string) => string): Highlight[] {
  const out: Highlight[] = [];

  const busiest = [...d.daily].sort((a, b) => entries(b) - entries(a) || b.date.localeCompare(a.date))[0];
  if (busiest && entries(busiest) >= 3) {
    const parts = [busiest.checkins && plural(busiest.checkins, 'check-in'), busiest.takeout && plural(busiest.takeout, 'takeout order'), busiest.rides && plural(busiest.rides, 'ride'), busiest.groceries && plural(busiest.groceries, 'grocery trip'), busiest.watched && plural(busiest.watched, 'play'), busiest.games && plural(busiest.games, 'game')].filter(Boolean);
    out.push({ key: 'busiest', text: `${weekday(busiest.date)} was the busiest day: ${parts.join(', ')}`, date: busiest.date });
  }

  const fresh = d.places.newPlaces;
  if (fresh.length) {
    const shown = fresh.slice(0, 3).map((p) => p.name);
    out.push({ key: 'new', text: `New places: ${shown.join(', ')}${fresh.length > 3 ? ` and ${fresh.length - 3} more` : ''}`, date: fresh[0].date });
  }

  const missing = d.outfits.notLogged;
  if (missing.length) out.push({ key: 'outfits', text: `No outfit logged on ${missing.map(weekday).join(', ')}`, date: missing[0] });

  const show = d.other.watching?.top[0];
  if (show && show.times >= 2) out.push({ key: 'watching', text: `Watched most: ${show.name} (${plural(show.times, 'play')})` });
  const artist = d.other.music?.topArtists[0];
  if (artist) out.push({ key: 'music', text: `Most played artist: ${artist.name}` });
  const eats = d.other.takeout?.places[0];
  if (eats && eats.times >= 2) out.push({ key: 'takeout', text: `Ordered from ${eats.name} ${eats.times} times` });

  return out;
}
