import type { ClothingItem, Outfit, Plan } from '../clothes/types';
import { tripOutfitsByDay, tripWornItemsByDay } from './tripPlans';
import type { PackExtra, Trip } from './types';

export { tripDays } from './tripDays';

export function tripsOnDate(trips: Trip[], date: string): Trip[] {
  return trips.filter((t) => t.startDate <= date && date <= t.endDate);
}

export interface PackClothes {
  item: ClothingItem;
  /** Names of planned outfits that need this piece. */
  viaOutfits: string[];
  /** Added by hand, so it can be removed from the list directly. */
  manual: boolean;
  /** Worn on its own on a day of the trip (the calendar has it), outside any outfit. */
  worn: boolean;
  packed: boolean;
}

export interface PackingList {
  clothes: PackClothes[];
  extras: (PackExtra & { packed: boolean })[];
  total: number;
  packedCount: number;
}

/**
 * The checklist: pieces from the trip's outfits (the calendar's plans and worn outfits on its days) plus hand-picked ones
 * (each listed once), then the extras. Derived, so editing an outfit or
 * the plan updates the list; only `packed` ids are stored.
 */
export function packingList(
  trip: Trip,
  items: ClothingItem[],
  outfits: Outfit[],
  outfitLabel: (o: Outfit) => string,
  plans: Plan[] = [],
): PackingList {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const packedIds = new Set(trip.packed);
  const entries = new Map<string, PackClothes>();
  const entry = (id: string) => {
    const item = itemById.get(id);
    if (!item) return undefined;
    let e = entries.get(id);
    if (!e) entries.set(id, (e = { item, viaOutfits: [], manual: false, worn: false, packed: packedIds.has(id) }));
    return e;
  };

  for (const id of trip.itemIds) {
    const e = entry(id);
    if (e) e.manual = true;
  }
  for (const [, dayOutfits] of [...tripOutfitsByDay(trip, plans, outfits)].sort(([a], [b]) => a.localeCompare(b))) {
    for (const o of dayOutfits) {
      const name = outfitLabel(o);
      for (const iid of o.itemIds) {
        const e = entry(iid);
        if (e && !e.viaOutfits.includes(name)) e.viaOutfits.push(name);
      }
    }
  }

  // Pieces worn on their own on the trip's days count too, the same as the calendar shows them.
  for (const day of tripWornItemsByDay(trip, items, outfits).values()) {
    for (const i of day) {
      const e = entry(i.id);
      if (e) e.worn = true;
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
