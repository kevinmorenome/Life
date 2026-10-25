import type { ClothingItem, Outfit } from '../clothes/types';
import type { PackExtra, Trip } from './types';

/** Longest trip we lay out day by day. */
const MAX_DAYS = 90;

/** Every YYYY-MM-DD from start to end inclusive (empty if end is before start). */
export function tripDays(trip: Pick<Trip, 'startDate' | 'endDate'>): string[] {
  const days: string[] = [];
  const d = new Date(trip.startDate + 'T00:00:00Z');
  const end = new Date(trip.endDate + 'T00:00:00Z');
  while (d <= end && days.length < MAX_DAYS) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

export function tripsOnDate(trips: Trip[], date: string): Trip[] {
  return trips.filter((t) => t.startDate <= date && date <= t.endDate);
}

export interface PackClothes {
  item: ClothingItem;
  /** Names of planned outfits that need this piece. */
  viaOutfits: string[];
  /** Added by hand, so it can be removed from the list directly. */
  manual: boolean;
  packed: boolean;
}

export interface PackingList {
  clothes: PackClothes[];
  extras: (PackExtra & { packed: boolean })[];
  total: number;
  packedCount: number;
}

/**
 * The checklist: pieces from every planned outfit plus hand-picked ones
 * (each listed once), then the extras. Derived, so editing an outfit or
 * the plan updates the list; only `packed` ids are stored.
 */
export function packingList(
  trip: Trip,
  items: ClothingItem[],
  outfits: Outfit[],
  outfitLabel: (o: Outfit) => string,
): PackingList {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const outfitById = new Map(outfits.map((o) => [o.id, o]));
  const packedIds = new Set(trip.packed);
  const entries = new Map<string, PackClothes>();
  const entry = (id: string) => {
    const item = itemById.get(id);
    if (!item) return undefined;
    let e = entries.get(id);
    if (!e) entries.set(id, (e = { item, viaOutfits: [], manual: false, packed: packedIds.has(id) }));
    return e;
  };

  for (const id of trip.itemIds) {
    const e = entry(id);
    if (e) e.manual = true;
  }
  for (const date of Object.keys(trip.outfitPlan).sort()) {
    for (const oid of trip.outfitPlan[date]) {
      const o = outfitById.get(oid);
      if (!o) continue;
      const name = outfitLabel(o);
      for (const iid of o.itemIds) {
        const e = entry(iid);
        if (e && !e.viaOutfits.includes(name)) e.viaOutfits.push(name);
      }
    }
  }

  const clothes = [...entries.values()].sort(
    (a, b) => a.item.category.localeCompare(b.item.category) || a.item.name.localeCompare(b.item.name),
  );
  const extras = trip.extras.map((x) => ({ ...x, packed: packedIds.has(x.id) }));
  const packedCount = clothes.filter((c) => c.packed).length + extras.filter((x) => x.packed).length;
  return { clothes, extras, total: clothes.length + extras.length, packedCount };
}

export function togglePacked(trip: Trip, id: string): Trip {
  const packed = trip.packed.includes(id) ? trip.packed.filter((p) => p !== id) : [...trip.packed, id];
  return { ...trip, packed, updatedAt: new Date().toISOString() };
}

export function unpackAll(trip: Trip): Trip {
  return { ...trip, packed: [], updatedAt: new Date().toISOString() };
}

/** Sets the outfits planned for one day (an empty list clears the day). */
export function withDayOutfits(trip: Trip, date: string, outfitIds: string[]): Trip {
  const outfitPlan = { ...trip.outfitPlan };
  if (outfitIds.length) outfitPlan[date] = outfitIds;
  else delete outfitPlan[date];
  return { ...trip, outfitPlan, updatedAt: new Date().toISOString() };
}

export function withExtra(trip: Trip, extra: PackExtra): Trip {
  const dup = trip.extras.some(
    (x) => x.group === extra.group && x.label.toLowerCase() === extra.label.toLowerCase(),
  );
  if (dup) return trip;
  return { ...trip, extras: [...trip.extras, extra], updatedAt: new Date().toISOString() };
}

export function withoutExtra(trip: Trip, id: string): Trip {
  return {
    ...trip,
    extras: trip.extras.filter((x) => x.id !== id),
    packed: trip.packed.filter((p) => p !== id),
    updatedAt: new Date().toISOString(),
  };
}

export function withoutManualItem(trip: Trip, id: string): Trip {
  return { ...trip, itemIds: trip.itemIds.filter((i) => i !== id), updatedAt: new Date().toISOString() };
}
