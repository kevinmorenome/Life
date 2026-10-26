import { shortDate } from '../../lib/format';
import type { ClothingItem, Outfit } from './types';
import { withoutWearOn, withWear } from './wear';

export function outfitName(o: Outfit): string {
  return o.name || `Outfit from ${shortDate(o.createdAt)}`;
}

/** The outfit's pieces, in order, skipping ones that no longer exist. */
export function outfitPieces(o: Outfit, items: ClothingItem[]): ClothingItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return o.itemIds.map((id) => byId.get(id)).filter((i): i is ClothingItem => !!i);
}

/**
 * Wearing an outfit counts as wearing each piece. Returns the records to save,
 * skipping any that already have a wear on that date.
 */
export function wearOutfit(o: Outfit, pieces: ClothingItem[], date: string) {
  return {
    outfit: o.wears.includes(date) ? null : withWear(o, date),
    pieces: pieces.filter((p) => !p.wears.includes(date)).map((p) => withWear(p, date)),
  };
}

/**
 * After editing an outfit's pieces, brings the pieces' wear logs in line with
 * the outfit's dated wears: pieces added get those days, pieces removed lose
 * them (unless another outfit worn that day still includes them). Returns the
 * item records to save.
 */
export function syncPieceWears(before: Outfit, after: Outfit, items: ClothingItem[], otherOutfits: Outfit[]): ClothingItem[] {
  if (after.wears.length === 0) return [];
  const added = new Set(after.itemIds.filter((id) => !before.itemIds.includes(id)));
  const removed = new Set(before.itemIds.filter((id) => !after.itemIds.includes(id)));
  const changed: ClothingItem[] = [];
  for (const item of items) {
    let next = item;
    if (added.has(item.id)) {
      for (const date of after.wears) if (!next.wears.includes(date)) next = withWear(next, date);
    } else if (removed.has(item.id)) {
      for (const date of after.wears) {
        const keptByOther = otherOutfits.some((o) => o.id !== after.id && o.itemIds.includes(item.id) && o.wears.includes(date));
        if (!keptByOther && next.wears.includes(date)) next = withoutWearOn(next, date);
      }
    }
    if (next !== item) changed.push(next);
  }
  return changed;
}

/** Outfits that include the item, most recently worn first. */
export function outfitsWithItem(itemId: string, outfits: Outfit[]): Outfit[] {
  const latest = (o: Outfit) => o.wears.reduce((a, b) => (a > b ? a : b), '');
  return outfits
    .filter((o) => o.itemIds.includes(itemId))
    .sort((a, b) => latest(b).localeCompare(latest(a)) || b.createdAt.localeCompare(a.createdAt));
}
