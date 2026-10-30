// How many labelled pills fit in a calendar day at full zoom (--z = 2), so a module with many entries
// on one day (Swarm check-ins) can show the ones that fit plus a "more" pill.

/** Height of the pill area at full zoom: the 120px row minus the 31px the day number takes. Keep in step with `.cal-pills` in styles.css. */
export const PILL_AREA = 89;
/** A text pill (0.62rem × 1.35 line + padding) and the gap between pills. */
export const PILL_HEIGHT = 15.5;
export const PILL_GAP = 2;
/** The outfit pill carries an 18px photo bubble. */
export const OUTFIT_PILL_HEIGHT = 20;

/** How many text pills fit once `used` px are taken by other pills. */
export function slotsLeft(used: number): number {
  return Math.max(0, Math.floor((PILL_AREA - used + PILL_GAP) / (PILL_HEIGHT + PILL_GAP)));
}

/**
 * How many of `count` entries to show in `slots` pills. When they don't all fit, one slot goes to the
 * "more" pill, so the rest are `more` entries.
 */
export function fitTiles(count: number, slots: number): { shown: number; more: number } {
  if (count <= slots) return { shown: count, more: 0 };
  const shown = Math.max(0, slots - 1);
  return { shown, more: count - shown };
}
