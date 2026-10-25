import { addDays, wearsByDay } from './calendar';
import { outfitPieces, wearOutfit } from './outfits';
import { lastWorn } from './stats';
import type { ClothingItem, Outfit } from './types';
import { withWear } from './wear';

/**
 * Recent days (newest first) with nothing logged, for the catch-up list.
 * Looks back at most `lookback` days from `now` (exclusive) and never earlier
 * than the first dated wear, so a new user isn't shown a backlog. `skipped`
 * days are left out.
 */
export function missedDays(
  items: ClothingItem[],
  outfits: Outfit[],
  now: string,
  skipped: string[] = [],
  lookback = 7,
): string[] {
  const logged = wearsByDay(items, outfits);
  const first = [...logged.keys()].sort()[0];
  if (!first) return [];
  const days: string[] = [];
  for (let n = 1; n <= lookback; n++) {
    const day = addDays(now, -n);
    if (day < first) break;
    if (!logged.has(day) && !skipped.includes(day)) days.push(day);
  }
  return days;
}

/** Outfits to offer for one-tap logging: most recently worn first, then newest. */
export function suggestedOutfits(outfits: Outfit[], date: string, limit = 8): Outfit[] {
  return outfits
    .filter((o) => o.itemIds.length > 0 && !o.wears.includes(date))
    .sort((a, b) => (lastWorn(b) ?? '').localeCompare(lastWorn(a) ?? '') || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** The most recent day before `date` that has anything logged, within `lookback` days. */
export function previousLoggedDay(items: ClothingItem[], outfits: Outfit[], date: string, lookback = 7): string | null {
  const logged = wearsByDay(items, outfits);
  for (let n = 1; n <= lookback; n++) {
    const day = addDays(date, -n);
    if (logged.has(day)) return day;
  }
  return null;
}

/**
 * Records to save so that `to` repeats what was worn on `from`: outfits (with
 * their pieces) and loose items. Anything already logged on `to` is skipped.
 */
export function repeatDay(from: string, to: string, items: ClothingItem[], outfits: Outfit[]) {
  const wore = wearsByDay(items, outfits).get(from);
  const outfitRecords: Outfit[] = [];
  const itemRecords = new Map<string, ClothingItem>();
  if (!wore) return { outfits: outfitRecords, items: [] as ClothingItem[] };

  for (const o of wore.outfits) {
    const { outfit, pieces } = wearOutfit(o, outfitPieces(o, items), to);
    if (outfit) outfitRecords.push(outfit);
    for (const p of pieces) itemRecords.set(p.id, p);
  }
  for (const i of wore.items) {
    if (!i.wears.includes(to)) itemRecords.set(i.id, withWear(i, to));
  }
  return { outfits: outfitRecords, items: [...itemRecords.values()] };
}
