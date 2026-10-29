import type { WorkDay, WorkEvent, WorkStatus, WorkTargetKind } from './types';

export interface DayInfo {
  status?: WorkStatus;
  /** True when the status was set by hand rather than derived from check-ins. */
  manual: boolean;
  /** Earliest arrival and latest departure, HH:MM. */
  arrive?: string;
  leave?: string;
}

/**
 * YYYY-MM-DD → what we know about that day. A day set by hand wins; otherwise
 * any arrival or departure means office, and an end-of-day "home" check-in
 * means home. Days with neither stay unknown (weekends, holidays, no data).
 */
export function buildDays(days: WorkDay[], events: WorkEvent[]): Map<string, DayInfo> {
  const out = new Map<string, DayInfo>();
  const get = (d: string) => {
    let v = out.get(d);
    if (!v) out.set(d, (v = { manual: false }));
    return v;
  };
  for (const e of events) {
    const v = get(e.date);
    if (e.type === 'arrive') {
      if (!v.arrive || e.time < v.arrive) v.arrive = e.time;
    } else if (e.type === 'leave') {
      if (!v.leave || e.time > v.leave) v.leave = e.time;
    }
    if (e.type === 'home') {
      if (!v.status) v.status = 'home';
    } else {
      v.status = 'office';
    }
  }
  for (const d of days) {
    const v = get(d.id);
    v.status = d.status;
    v.manual = true;
  }
  return out;
}

export function isWeekday(date: string): boolean {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  return dow >= 1 && dow <= 5;
}

export interface MonthSummary {
  office: number;
  home: number;
  off: number;
  /** Weekdays of the month that aren't a day off. */
  workdays: number;
  /** Weekdays from today on (or the whole month ahead) without a status yet: days that could still become office days. */
  open: number;
}

/** `ym` is YYYY-MM; `now` is today's YYYY-MM-DD. */
export function monthSummary(ym: string, infos: Map<string, DayInfo>, now: string): MonthSummary {
  const s: MonthSummary = { office: 0, home: 0, off: 0, workdays: 0, open: 0 };
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let day = 1; day <= last; day++) {
    const date = `${ym}-${String(day).padStart(2, '0')}`;
    const status = infos.get(date)?.status;
    if (status) s[status]++;
    // A weekend day someone marked still counts as that status, but isn't a workday.
    if (isWeekday(date) && status !== 'off') s.workdays++;
    if (isWeekday(date) && !status && date >= now) s.open++;
  }
  return s;
}

export interface TargetProgress {
  count: number;
  target: number;
  /** Days left to reach the target (min-office), or before the cap is hit (max-home); negative when over the cap. */
  left: number;
  /** Whether the goal is met (min-office) or still within the cap (max-home). */
  met: boolean;
  /** Whether it can still be met this month. */
  reachable: boolean;
  /** Over the cap, but within the extended one you can request. */
  needsApproval: boolean;
  /** Over even the extended cap. */
  overExtended: boolean;
}

/** `extended` is the higher cap you can ask for (max-home only): going past `target` up to it needs approval. */
export function targetProgress(s: MonthSummary, target: number, kind: WorkTargetKind, extended = target): TargetProgress {
  if (kind === 'max-home') {
    const left = target - s.home;
    return {
      count: s.home,
      target,
      left,
      met: left >= 0,
      reachable: left >= 0,
      needsApproval: left < 0 && s.home <= extended,
      overExtended: s.home > extended,
    };
  }
  const left = Math.max(0, target - s.office);
  return { count: s.office, target, left, met: left === 0, reachable: left <= s.open, needsApproval: false, overExtended: false };
}

export interface TimeStats {
  /** Averages as minutes after midnight; undefined with no data. */
  arrive?: number;
  leave?: number;
  /** Average minutes between arriving and leaving, over days with both. */
  duration?: number;
  /** Office days the averages come from. */
  days: number;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 60 ? `${h + 1}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

const mean = (xs: number[]): number | undefined => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

/** Arrival/leave averages over office days whose date starts with `prefix` ('' = all time). */
export function timeStats(infos: Map<string, DayInfo>, prefix = ''): TimeStats {
  const arrive: number[] = [];
  const leave: number[] = [];
  const duration: number[] = [];
  let days = 0;
  for (const [date, d] of infos) {
    if (d.status !== 'office' || !date.startsWith(prefix)) continue;
    days++;
    if (d.arrive) arrive.push(toMinutes(d.arrive));
    if (d.leave) leave.push(toMinutes(d.leave));
    if (d.arrive && d.leave && d.leave > d.arrive) duration.push(toMinutes(d.leave) - toMinutes(d.arrive));
  }
  return { arrive: mean(arrive), leave: mean(leave), duration: mean(duration), days };
}

export interface MonthRow {
  month: string;
  office: number;
  home: number;
  off: number;
}

/** The last `count` months ending at `ym`, oldest first. */
export function monthHistory(ym: string, infos: Map<string, DayInfo>, count: number): MonthRow[] {
  const [y, m] = ym.split('-').map(Number);
  const rows: MonthRow[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const month = new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7);
    const row: MonthRow = { month, office: 0, home: 0, off: 0 };
    for (const [date, d] of infos) if (d.status && date.startsWith(month)) row[d.status]++;
    rows.push(row);
  }
  return rows;
}

/** Office and home days per weekday (Mon = 0 … Fri = 4) over the dates starting with `prefix`. */
export function weekdaySplit(infos: Map<string, DayInfo>, prefix = ''): { office: number; home: number }[] {
  const rows = Array.from({ length: 5 }, () => ({ office: 0, home: 0 }));
  for (const [date, d] of infos) {
    if (!date.startsWith(prefix) || !isWeekday(date)) continue;
    const i = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;
    if (d.status === 'office') rows[i].office++;
    else if (d.status === 'home') rows[i].home++;
  }
  return rows;
}
