// Derived work stats beyond the monthly target (see work.ts). All pure.

import { addDays } from '../clothes/calendar';
import type { WorkStatus } from './types';
import { isWeekday, toMinutes, type DayInfo } from './work';

export type StatusCounts = Record<WorkStatus, number>;

/** Days of each kind whose date starts with `prefix` ('' = all time). */
export function statusCounts(infos: Map<string, DayInfo>, prefix = ''): StatusCounts {
  const c: StatusCounts = { office: 0, home: 0, off: 0, trip: 0 };
  for (const [date, d] of infos) if (d.status && date.startsWith(prefix)) c[d.status]++;
  return c;
}

/** Office share of office + home days, 0–100; undefined when there are none. */
export function officeShare(office: number, home: number): number | undefined {
  const total = office + home;
  return total ? Math.round((office / total) * 100) : undefined;
}

/** The days within `from`–`to` (inclusive, either may be left open). */
export function filterRange(infos: Map<string, DayInfo>, from?: string, to?: string): Map<string, DayInfo> {
  if (!from && !to) return infos;
  const out = new Map<string, DayInfo>();
  for (const [date, d] of infos) if ((!from || date >= from) && (!to || date <= to)) out.set(date, d);
  return out;
}

export function mondayOf(date: string): string {
  return addDays(date, -((new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7));
}

export interface RunStreak {
  current: number;
  longest: number;
}

/**
 * Runs of consecutive workdays in the office, and of consecutive workdays at home.
 * Weekends, days off and trips neither extend nor break a run; a weekday with
 * nothing logged does (except today, which may simply not be logged yet).
 */
export function attendanceStreaks(infos: Map<string, DayInfo>, now: string): { office: RunStreak; home: RunStreak } {
  const out = { office: { current: 0, longest: 0 }, home: { current: 0, longest: 0 } };
  const first = [...infos.keys()].filter((d) => d <= now).sort()[0];
  if (!first) return out;
  for (let date = first; date <= now; date = addDays(date, 1)) {
    if (!isWeekday(date)) continue;
    const status = infos.get(date)?.status;
    if (status === 'off' || status === 'trip') continue;
    if (!status) {
      if (date !== now) out.office.current = out.home.current = 0;
      continue;
    }
    const other = status === 'office' ? 'home' : 'office';
    out[status].current++;
    out[status].longest = Math.max(out[status].longest, out[status].current);
    out[other].current = 0;
  }
  return out;
}

export interface WeekRow {
  /** Monday, YYYY-MM-DD. */
  start: string;
  office: number;
  home: number;
}

/** The last `weeks` weeks (Monday first), oldest first, ending with the week of `now`. */
export function weeklyCounts(infos: Map<string, DayInfo>, now: string, weeks = 12): WeekRow[] {
  const last = mondayOf(now);
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(last, -7 * (weeks - 1 - i));
    const row: WeekRow = { start, office: 0, home: 0 };
    for (let k = 0; k < 7; k++) {
      const status = infos.get(addDays(start, k))?.status;
      if (status === 'office') row.office++;
      else if (status === 'home') row.home++;
    }
    return row;
  });
}

export interface DayCell {
  date: string;
  status?: WorkStatus;
  future: boolean;
}

/** Columns of Monday–Sunday for the last `weeks` weeks, oldest first. */
export function dayGrid(infos: Map<string, DayInfo>, now: string, weeks = 20): DayCell[][] {
  const first = addDays(mondayOf(now), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(first, w * 7 + d);
      return { date, status: infos.get(date)?.status, future: date > now };
    }),
  );
}

export interface ArrivalBin {
  /** Start of the half hour, HH:MM. */
  start: string;
  count: number;
}

const FIRST_BIN = 7 * 60;
const LAST_BIN = 10 * 60 + 30;

/**
 * Office arrivals by half hour, from 07:00 to 10:30. Earlier arrivals count in
 * the first bin and later ones in the last. Empty when there are no arrivals.
 */
export function arrivalBins(infos: Map<string, DayInfo>, prefix = ''): ArrivalBin[] {
  const counts = new Map<number, number>();
  let any = false;
  for (const [date, d] of infos) {
    if (d.status !== 'office' || !d.arrive || !date.startsWith(prefix)) continue;
    any = true;
    const bin = Math.min(LAST_BIN, Math.max(FIRST_BIN, Math.floor(toMinutes(d.arrive) / 30) * 30));
    counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }
  if (!any) return [];
  const bins: ArrivalBin[] = [];
  for (let m = FIRST_BIN; m <= LAST_BIN; m += 30) {
    bins.push({ start: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, count: counts.get(m) ?? 0 });
  }
  return bins;
}

export interface TimeExtremes {
  earliest?: { date: string; time: string };
  latest?: { date: string; time: string };
  longest?: { date: string; minutes: number };
}

/** Earliest start, latest finish and longest day, over every day that has times. */
export function timeExtremes(infos: Map<string, DayInfo>): TimeExtremes {
  const out: TimeExtremes = {};
  for (const [date, d] of infos) {
    if (d.arrive && (!out.earliest || d.arrive < out.earliest.time)) out.earliest = { date, time: d.arrive };
    if (d.leave && (!out.latest || d.leave > out.latest.time)) out.latest = { date, time: d.leave };
    if (d.arrive && d.leave && d.leave > d.arrive) {
      const minutes = toMinutes(d.leave) - toMinutes(d.arrive);
      if (!out.longest || minutes > out.longest.minutes) out.longest = { date, minutes };
    }
  }
  return out;
}
