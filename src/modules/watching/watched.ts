import type { Play } from './types';

const two = (n: number) => String(n).padStart(2, '0');

/** Local date (YYYY-MM-DD) and time (HH:MM) of a play, in the device's time zone. */
export function when(p: Play): { date: string; time: string } {
  const d = new Date(p.at);
  return { date: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, time: `${two(d.getHours())}:${two(d.getMinutes())}` };
}

/** Plays grouped by local date, each day earliest first. */
export function byDate(plays: Play[]): Map<string, Play[]> {
  const days = new Map<string, Play[]>();
  for (const p of [...plays].sort((a, b) => a.at.localeCompare(b.at))) {
    const date = when(p).date;
    const list = days.get(date);
    if (list) list.push(p);
    else days.set(date, [p]);
  }
  return days;
}

/** "S02E03", or "" for a movie. */
export function episodeCode(p: Play): string {
  return p.kind === 'episode' && p.season !== undefined && p.number !== undefined ? `S${two(p.season)}E${two(p.number)}` : '';
}

/** What a day's tiles show: each title once, in the order watched. */
export function dayTitles(list: Play[]): string[] {
  return [...new Set(list.map((p) => p.title))];
}

/** Short label for a day's mark: the title, or how many things when there were several. */
export function dayLabel(list: Play[]): string {
  const titles = dayTitles(list);
  return titles.length === 1 ? titles[0] : `${titles.length} titles`;
}

export interface WatchSummary {
  plays: number;
  movies: number;
  episodes: number;
  /** Different shows with at least one episode. */
  shows: number;
  /** Date of the first play in the period. */
  since?: string;
}

const inPeriod = (p: Play, prefix: string) => when(p).date.startsWith(prefix);

/** Counts for the plays whose local date starts with `prefix` ('' = all time). */
export function summarize(plays: Play[], prefix = ''): WatchSummary {
  const list = plays.filter((p) => inPeriod(p, prefix));
  const episodes = list.filter((p) => p.kind === 'episode');
  return {
    plays: list.length,
    movies: list.length - episodes.length,
    episodes: episodes.length,
    shows: new Set(episodes.map((p) => p.traktId ?? p.title)).size,
    since: list.reduce<string | undefined>((a, p) => {
      const d = when(p).date;
      return !a || d < a ? d : a;
    }, undefined),
  };
}

export interface TitleRow {
  key: string;
  title: string;
  kind: 'movie' | 'episode';
  /** Plays (episodes of a show, or times a movie was watched). */
  count: number;
  days: number;
  last: string;
}

/** Most-watched titles: shows by episodes watched, movies by plays. Ties go to the one watched more recently. */
export function topTitles(plays: Play[], prefix = '', kind?: Play['kind']): TitleRow[] {
  const rows = new Map<string, TitleRow & { dates: Set<string> }>();
  for (const p of plays) {
    if (kind && p.kind !== kind) continue;
    const { date } = when(p);
    if (!date.startsWith(prefix)) continue;
    const key = `${p.kind}:${p.traktId ?? p.title.toLowerCase()}`;
    const row = rows.get(key) ?? { key, title: p.title, kind: p.kind, count: 0, days: 0, last: date, dates: new Set<string>() };
    row.count++;
    row.dates.add(date);
    if (date > row.last) row.last = date;
    rows.set(key, row);
  }
  return [...rows.values()]
    .map(({ dates, ...r }) => ({ ...r, days: dates.size }))
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last) || a.title.localeCompare(b.title));
}

export interface MonthCount {
  month: string;
  movies: number;
  episodes: number;
}

/** The `n` months up to and including `endMonth` (YYYY-MM), empty months included. */
export function monthlyCounts(plays: Play[], endMonth: string, n = 12): MonthCount[] {
  const [y, m] = endMonth.split('-').map(Number);
  const months: MonthCount[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push({ month: `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}`, movies: 0, episodes: 0 });
  }
  const index = new Map(months.map((r) => [r.month, r]));
  for (const p of plays) {
    const row = index.get(when(p).date.slice(0, 7));
    if (!row) continue;
    if (p.kind === 'movie') row.movies++;
    else row.episodes++;
  }
  return months;
}

/** Plays per weekday, Monday first. */
export function weekdayCounts(plays: Play[], prefix = ''): number[] {
  const counts = new Array<number>(7).fill(0);
  for (const p of plays) {
    const { date } = when(p);
    if (date.startsWith(prefix)) counts[(new Date(date + 'T00:00:00').getDay() + 6) % 7]++;
  }
  return counts;
}

/** Plays per hour of the day (24 values). */
export function hourCounts(plays: Play[], prefix = ''): number[] {
  const counts = new Array<number>(24).fill(0);
  for (const p of plays) {
    const { date, time } = when(p);
    if (date.startsWith(prefix)) counts[Number(time.slice(0, 2))]++;
  }
  return counts;
}

/** Days in a row with at least one play, ending today or yesterday (so it doesn't reset before the evening). */
export function dayStreak(plays: Play[], now: string): { current: number; longest: number } {
  const days = [...new Set(plays.map((p) => when(p).date))].sort();
  const day = (s: string) => Math.round(Date.parse(s + 'T00:00:00Z') / 86_400_000);
  let longest = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && day(days[i]) - day(days[i - 1]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const last = days[days.length - 1];
  const current = last !== undefined && day(now) - day(last) <= 1 ? run : 0;
  return { current, longest };
}

/** Newest first. */
export function newestFirst(plays: Play[]): Play[] {
  return [...plays].sort((a, b) => b.at.localeCompare(a.at));
}

/** Plays whose title, episode title or date contain every word of `query`. */
export function searchPlays(plays: Play[], query: string): Play[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return plays;
  return plays.filter((p) => {
    const hay = `${p.title} ${p.episodeTitle ?? ''} ${episodeCode(p)} ${when(p).date}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
