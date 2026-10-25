import { shortDate } from '../../lib/format';
import type { ClothingItem, Outfit } from './types';
import { withWear } from './wear';

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
