// A small iCalendar (.ics) reader for the TripIt feed. Pure: text in, events out. Only what we need: VEVENTs with a
// UID, SUMMARY, start/end, LOCATION, DESCRIPTION and URL. Everything else is ignored.

export interface IcsEvent {
  uid: string;
  summary: string;
  /** YYYY-MM-DD, local to the event when the feed says where (a TZID or floating time), else the UTC day. */
  start: string;
  /** HH:MM, undefined for all-day events. */
  startTime?: string;
  /** YYYY-MM-DD, inclusive (an all-day DTEND is exclusive in iCalendar; this already has the day taken off). */
  end: string;
  endTime?: string;
  allDay: boolean;
  /** The TZID of the start, when there is one. */
  tz?: string;
  location?: string;
  description?: string;
  url?: string;
}

/** Joins folded lines (a line starting with a space or tab continues the one before). */
function unfold(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length > 0) lines[lines.length - 1] += raw.slice(1);
    else lines.push(raw);
  }
  return lines;
}

const unescapeText = (s: string): string =>
  s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\');

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseLine(line: string): Prop | null {
  // The value starts at the first colon that is not inside a quoted parameter value.
  let inQuote = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ':' && !inQuote) {
      colon = i;
      break;
    }
  }
  if (colon < 1) return null;
  const [name, ...rest] = line.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const p of rest) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

interface When {
  date: string;
  time?: string;
  allDay: boolean;
  tz?: string;
}

/** 20261104, 20261104T093000 or 20261104T093000Z → a date and optional time. */
export function parseWhen(prop: Prop): When | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/.exec(prop.value.trim());
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (m[4] === undefined || prop.params.VALUE === 'DATE') return { date, allDay: true };
  return { date, time: `${m[4]}:${m[5]}`, allDay: false, tz: m[7] ? 'UTC' : prop.params.TZID };
}

function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Every VEVENT in the text that has a UID, a summary and a start. Cancelled events are left out. */
export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Prop[] | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') current = [];
    else if (line === 'END:VEVENT') {
      if (current) {
        const e = toEvent(current);
        if (e) events.push(e);
      }
      current = null;
    } else if (current) {
      const prop = parseLine(line);
      if (prop) current.push(prop);
    }
  }
  return events;
}

function toEvent(props: Prop[]): IcsEvent | null {
  const get = (name: string) => props.find((p) => p.name === name);
  const uid = get('UID')?.value.trim();
  const summary = unescapeText(get('SUMMARY')?.value ?? '').trim();
  const startProp = get('DTSTART');
  const start = startProp && parseWhen(startProp);
  if (!uid || !summary || !start) return null;
  if (get('STATUS')?.value.trim().toUpperCase() === 'CANCELLED') return null;
  const endProp = get('DTEND');
  const end = endProp ? parseWhen(endProp) : null;
  // An all-day end is the day after the last day; a timed end is the end itself.
  let endDate = end ? (end.allDay ? dayBefore(end.date) : end.date) : start.date;
  if (endDate < start.date) endDate = start.date;
  const location = unescapeText(get('LOCATION')?.value ?? '').trim();
  const description = unescapeText(get('DESCRIPTION')?.value ?? '').trim();
  const url = get('URL')?.value.trim();
  return {
    uid,
    summary,
    start: start.date,
    ...(start.time ? { startTime: start.time } : {}),
    end: endDate,
    ...(end && !end.allDay && end.time ? { endTime: end.time } : {}),
    allDay: start.allDay,
    ...(start.tz ? { tz: start.tz } : {}),
    ...(location ? { location } : {}),
    ...(description ? { description } : {}),
    ...(url ? { url } : {}),
  };
}
