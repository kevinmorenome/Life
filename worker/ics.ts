// A small iCalendar (.ics) reader for the TripIt feed. Pure: text in, events out. Only what we need: VEVENTs with a
// UID, SUMMARY, start/end, LOCATION, DESCRIPTION and URL. Everything else is ignored.

import type { IcsReport } from './icsTypes';

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

/** The properties of every VEVENT, in order, plus how many of each component the text has. */
function scan(text: string): { blocks: Prop[][]; components: Record<string, number> } {
  const blocks: Prop[][] = [];
  const components: Record<string, number> = {};
  let current: Prop[] | null = null;
  for (const line of unfold(text)) {
    const begin = /^BEGIN:([A-Za-z0-9-]+)$/i.exec(line);
    if (begin) {
      const name = begin[1].toUpperCase();
      components[name] = (components[name] ?? 0) + 1;
      if (name === 'VEVENT') current = [];
    } else if (line.toUpperCase() === 'END:VEVENT') {
      if (current) blocks.push(current);
      current = null;
    } else if (current) {
      const prop = parseLine(line);
      if (prop) current.push(prop);
    }
  }
  return { blocks, components };
}

/** Every VEVENT in the text that has a UID, a summary and a start. Cancelled events are left out. */
export function parseIcs(text: string): IcsEvent[] {
  return scan(text)
    .blocks.map(toEvent)
    .filter((e): e is IcsEvent => e !== null);
}

export type { IcsReport };

/** What is in a feed, without any of its content: counts and property names, safe to show and to share. */
export function reportIcs(text: string): IcsReport {
  const { blocks, components } = scan(text);
  const cancelled = blocks.filter((b) => b.some((p) => p.name === 'STATUS' && p.value.trim().toUpperCase() === 'CANCELLED')).length;
  const parsed = blocks.map(toEvent).filter((e): e is IcsEvent => e !== null);
  const usable = parsed.length;
  const earliest = parsed.reduce<string | undefined>((m, e) => (m === undefined || e.start < m ? e.start : m), undefined);
  const latest = parsed.reduce<string | undefined>((m, e) => (m === undefined || e.end > m ? e.end : m), undefined);
  const first = blocks[0] ?? [];
  return {
    components,
    events: blocks.length,
    ...(earliest ? { earliest } : {}),
    ...(latest ? { latest } : {}),
    usable,
    cancelled,
    unreadable: blocks.length - usable - cancelled,
    firstEventProps: first.map((p) => [p.name, ...Object.keys(p.params)].join(';')),
  };
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
