import type { MusicDay, Ranked } from './types';

const two = (n: number) => String(n).padStart(2, '0');
const dayNo = (s: string) => Math.round(Date.parse(s + 'T00:00:00Z') / 86_400_000);

/** The date `n` days before `date` (YYYY-MM-DD). */
export function daysBefore(date: string, n: number): string {
  const d = new Date((dayNo(date) - n) * 86_400_000);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
}

/** Where the next fetch starts: a couple of days before the newest stored day, since recent days can still grow. Undefined = from the beginning. */
export function syncFrom(days: MusicDay[]): string | undefined {
  let newest = '';
  for (const d of days) if (d.date > newest) newest = d.date;
  return newest ? daysBefore(newest, 2) : undefined;
}

export function byDate(days: MusicDay[]): Map<string, MusicDay> {
  return new Map(days.map((d) => [d.date, d]));
}

/** "2h 05m", "45 min", "3 days 4h" is never needed: totals over a day use hours. */
export function duration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 === 0 ? `${h}h` : `${h}h ${two(min % 60)}m`;
}

export const hoursOf = (ms: number) => Math.round(ms / 3_600_000);

export function inPeriod(days: MusicDay[], prefix: string): MusicDay[] {
  return prefix ? days.filter((d) => d.date.startsWith(prefix)) : days;
}

export interface Summary {
  plays: number;
  ms: number;
  activeDays: number;
}

export function summarize(days: MusicDay[], prefix = ''): Summary {
  const list = inPeriod(days, prefix);
  return { plays: list.reduce((n, d) => n + d.plays, 0), ms: list.reduce((n, d) => n + d.ms, 0), activeDays: list.filter((d) => d.plays > 0).length };
}

/** Artists or tracks ranked by the plays in the days' own top-5 lists, so a name that is never in a day's top 5 is not counted. */
export function topOf(days: MusicDay[], kind: 'topArtists' | 'topTracks', prefix = '', n = 10): (Ranked & { days: number })[] {
  const totals = new Map<number, Ranked & { days: number }>();
  for (const d of inPeriod(days, prefix)) {
    for (const r of d[kind]) {
      const t = totals.get(r.id);
      if (t) {
        t.plays += r.plays;
        t.days++;
        if (!t.name && r.name) t.name = r.name;
        if (!t.artist && r.artist) t.artist = r.artist;
      } else totals.set(r.id, { ...r, days: 1 });
    }
  }
  return [...totals.values()].sort((a, b) => b.plays - a.plays || a.id - b.id).slice(0, n);
}

export interface MonthTotal {
  month: string;
  ms: number;
  plays: number;
}

/** The `n` months up to and including `endMonth` (YYYY-MM), empty months included. */
export function monthlyTotals(days: MusicDay[], endMonth: string, n = 12): MonthTotal[] {
  const [y, m] = endMonth.split('-').map(Number);
  const months: MonthTotal[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push({ month: `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}`, ms: 0, plays: 0 });
  }
  const index = new Map(months.map((r) => [r.month, r]));
  for (const d of days) {
    const row = index.get(d.date.slice(0, 7));
    if (row) {
      row.ms += d.ms;
      row.plays += d.plays;
    }
  }
  return months;
}

/** Plays per weekday, Monday first. */
export function weekdayPlays(days: MusicDay[], prefix = ''): number[] {
  const counts = new Array<number>(7).fill(0);
  for (const d of inPeriod(days, prefix)) counts[(new Date(d.date + 'T00:00:00Z').getUTCDay() + 6) % 7] += d.plays;
  return counts;
}

/** Plays per hour of the day (24 values). */
export function hourPlays(days: MusicDay[], prefix = ''): number[] {
  const counts = new Array<number>(24).fill(0);
  for (const d of inPeriod(days, prefix)) for (let h = 0; h < 24; h++) counts[h] += d.hours?.[h] ?? 0;
  return counts;
}

/** Days in a row with listening, ending today or yesterday (so it doesn't reset before the evening). */
export function dayStreak(days: MusicDay[], now: string): { current: number; longest: number } {
  const dates = days.filter((d) => d.plays > 0).map((d) => d.date).sort();
  let longest = 0;
  let run = 0;
  for (let i = 0; i < dates.length; i++) {
    run = i > 0 && dayNo(dates[i]) - dayNo(dates[i - 1]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const last = dates[dates.length - 1];
  return { current: last !== undefined && dayNo(now) - dayNo(last) <= 1 ? run : 0, longest };
}

/** The custom ID from what people paste: the ID itself, or a stats.fm profile or invite link. */
export function parseUser(input: string): string | null {
  const s = input.trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  const last = s.split('/').pop() ?? '';
  return /^[A-Za-z0-9_.-]{1,40}$/.test(last) && !/^(invite|user|users|u)$/i.test(last) ? last : null;
}
