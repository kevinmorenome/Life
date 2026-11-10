// The MCP `log_work` tool: when the user started and finished work on a day, and where they worked
// (office, home or on a business trip). Each call writes fresh `workevents` records (never edits a
// day), so a day set by hand in the app still wins; the app turns the events into days.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
export const PLACES = ['office', 'home', 'trip'] as const;
export type Place = (typeof PLACES)[number];

export interface WorkEventRecord {
  id: string;
  type: 'arrive' | 'leave' | 'office' | 'home' | 'trip';
  place?: Place;
  date: string;
  time: string;
  source: 'claude';
  createdAt: string;
  updatedAt: string;
}

export type WorkLogResult = { records: WorkEventRecord[] } | { error: string };

function realDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** "9:05" → "09:05"; undefined when not a time. */
function hhmm(v: unknown): string | undefined {
  const m = typeof v === 'string' ? TIME.exec(v.trim()) : null;
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined;
}

export function parseWorkLog(args: Record<string, unknown>, now: Date): WorkLogResult {
  if (!realDate(args.date)) return { error: 'date must be a real calendar date in YYYY-MM-DD form (the user’s local day).' };
  const tomorrow = new Date(now.getTime() + 24 * 3600_000).toISOString().slice(0, 10);
  if (args.date > tomorrow) return { error: 'Can’t log work in the future.' };
  const place = PLACES.find((p) => p === args.place);
  if (!place) return { error: `place must be one of: ${PLACES.join(', ')} ("trip" = business trip).` };

  const times: { type: 'arrive' | 'leave'; time: string }[] = [];
  for (const [field, type] of [['arrive', 'arrive'], ['leave', 'leave']] as const) {
    if (args[field] === undefined || args[field] === null || args[field] === '') continue;
    const time = hhmm(args[field]);
    if (!time) return { error: `${field} must be a 24-hour time like 08:45.` };
    times.push({ type, time });
  }
  const [a, l] = [times.find((t) => t.type === 'arrive'), times.find((t) => t.type === 'leave')];
  if (a && l && l.time <= a.time) return { error: 'leave must be after arrive.' };

  const stamp = now.toISOString();
  const rec = (type: WorkEventRecord['type'], time: string, withPlace: boolean): WorkEventRecord => ({
    id: `claude-${type}${withPlace ? '-' + place : ''}-${args.date}-${time.replace(':', '')}`,
    type,
    ...(withPlace ? { place } : {}),
    date: args.date as string,
    time,
    source: 'claude',
    createdAt: stamp,
    updatedAt: stamp,
  });
  const records = times.map((t) => rec(t.type, t.time, true));
  // The day's status on its own: also when no times are given, or only a trip/home day is known.
  records.push(rec(place, '00:00', false));
  return { records };
}
