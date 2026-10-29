import { addDays, addMonths } from './calendar';

/** How much of each day the calendar shows: dots, a photo, or titles. */
export const ZOOMS = ['compact', 'standard', 'detail'] as const;
export type Zoom = (typeof ZOOMS)[number];

/** One level in (+1) or out (-1), stopping at the ends. */
export function stepZoom(zoom: Zoom, dir: 1 | -1): Zoom {
  const i = ZOOMS.indexOf(zoom) + dir;
  return ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i))];
}

/** Fingers spread past 1.25× their start distance zoom in, pinched under 0.8× zoom out. */
export function pinchStep(startDistance: number, distance: number): 1 | -1 | 0 {
  if (startDistance <= 0) return 0;
  const ratio = distance / startDistance;
  return ratio > 1.25 ? 1 : ratio < 0.8 ? -1 : 0;
}

/** Monday on or before a YYYY-MM-DD. */
export function mondayOf(date: string): string {
  const dow = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;
  return addDays(date, -dow);
}

/** Mondays of every week touching the months from `fromMonth` to `toMonth` (YYYY-MM, inclusive). */
export function weekStarts(fromMonth: string, toMonth: string): string[] {
  const last = addDays(`${addMonths(toMonth, 1)}-01`, -1);
  const out: string[] = [];
  for (let d = mondayOf(`${fromMonth}-01`); d <= last; d = addDays(d, 7)) out.push(d);
  return out;
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** The month a week belongs to for the title: the one its Thursday is in (as ISO weeks do). */
export function monthOfWeek(start: string): string {
  return addDays(start, 3).slice(0, 7);
}
