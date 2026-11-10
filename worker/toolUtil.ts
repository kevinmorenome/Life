// Helpers shared by the MCP tool files (mcpTools.ts, readTools.ts).

import type { WornNames } from '../src/modules/checkins/digest';
import type { PlaceCheckin } from '../src/modules/checkins/placesQuery';
import type { ToolResult } from './mcpTools';
import type { RecordStore, Row } from './records';

export type Args = Record<string, unknown>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const fail = (text: string): ToolResult => ({ text, isError: true });
export const ok = (value: unknown): ToolResult => ({ text: typeof value === 'string' ? value : JSON.stringify(value, null, 1) });

export const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
export const wearsOf = (r: Row): string[] => strings(r.wears);
export const timesWorn = (r: Row): number => wearsOf(r).length + (typeof r.priorWears === 'number' ? r.priorWears : 0);
export const lastWorn = (r: Row): string | null => wearsOf(r).reduce<string | null>((a, b) => (!a || b > a ? b : a), null);
export const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function text(v: unknown, max = 200): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
}

export function isRealDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const utcToday = (now: Date) => now.toISOString().slice(0, 10);

/** Date → names of the outfits worn and of the pieces worn outside them, from `since` on. */
export function wornByDay(items: Row[], outfits: Row[], since = ''): Map<string, WornNames> {
  const log = new Map<string, WornNames>();
  const day = (d: string) => log.get(d) ?? (log.set(d, { outfits: [], items: [] }), log.get(d)!);
  const inOutfits = new Map<string, Set<string>>();
  for (const o of outfits) {
    for (const d of new Set(wearsOf(o))) {
      if (d < since) continue;
      day(d).outfits.push(String(o.name ?? '(unnamed outfit)'));
      const ids = inOutfits.get(d) ?? new Set<string>();
      for (const id of strings(o.itemIds)) ids.add(id);
      inOutfits.set(d, ids);
    }
  }
  for (const i of items) {
    for (const d of new Set(wearsOf(i))) {
      if (d < since) continue;
      if (!inOutfits.get(d)?.has(i.id)) day(d).items.push(String(i.name));
    }
  }
  return log;
}

export const placeCheckins = async (store: RecordStore): Promise<PlaceCheckin[]> =>
  (await store.list('checkins')).filter((r) => typeof r.venue === 'string' && isRealDate(r.date)).map((r) => ({ ...r, time: typeof r.time === 'string' ? r.time : '' }) as unknown as PlaceCheckin);

/** The `date`, `from` and `to` of a call as one inclusive range, or an error message. */
export function dateRange(args: Args): { from?: string; to?: string } | string {
  for (const k of ['date', 'from', 'to'] as const) if (args[k] !== undefined && !isRealDate(args[k])) return `${k} must be a real calendar date in YYYY-MM-DD form.`;
  const from = (args.date ?? args.from) as string | undefined;
  const to = (args.date ?? args.to) as string | undefined;
  if (from && to && from > to) return 'from must not be after to.';
  return { from, to };
}
