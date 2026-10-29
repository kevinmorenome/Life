import { addDays, addMonths } from './calendar';

/** How much of each day the calendar shows: dots, a photo, or titles. */
export const ZOOMS = ['compact', 'standard', 'detail'] as const;
export type Zoom = (typeof ZOOMS)[number];

/** A continuous zoom runs from 0 (compact) to 2 (detail); the levels sit on the whole numbers. */
export const MAX_ZOOM = ZOOMS.length - 1;

/** How far the fingers must spread to move one level. */
const SPREAD_PER_LEVEL = 1.9;

/** Zoom while pinching: `start` is the zoom when the fingers went down, the distances are between the two fingers. */
export function pinchZoom(start: number, startDistance: number, distance: number): number {
  if (startDistance <= 0 || distance <= 0) return start;
  const z = start + Math.log(distance / startDistance) / Math.log(SPREAD_PER_LEVEL);
  return Math.min(MAX_ZOOM, Math.max(0, z));
}

/** The level a zoom settles on when the fingers lift. */
export function nearestLevel(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(0, Math.round(z)));
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
