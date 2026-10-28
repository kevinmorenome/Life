import { money } from '../../lib/format';
import { itemColors } from './colors';
import { label, type ClothingItem } from './types';

/** Items added automatically (e.g. from receipts) that the owner hasn't checked yet, newest first. */
export function itemsToReview(items: ClothingItem[]): ClothingItem[] {
  return items.filter((i) => i.needsReview).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Items to step through in a review session: oldest first (the order they arrived in), without the ones put off for later. */
export function reviewQueue(items: ClothingItem[], later: ReadonlySet<string>): ClothingItem[] {
  return items
    .filter((i) => i.needsReview && !later.has(i.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** The same item with the review flag cleared. */
export function markReviewed(item: ClothingItem, now: Date): ClothingItem {
  const { needsReview: _flag, ...rest } = item;
  return { ...rest, updatedAt: now.toISOString() };
}

/** What the review list shows under the name, so mistakes in the email's data are easy to spot. */
export function reviewSummary(item: ClothingItem): string {
  return [
    item.brand,
    item.subcategory ?? label(item.category),
    itemColors(item).join(', '),
    item.size ? `Size ${item.size}` : undefined,
    item.price != null ? money(item.price) : undefined,
    item.purchaseDate,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The item with its photo swapped for the cut-out, if that photo is still the one the cut-out was made from
 * (the owner may have changed it, or other fields, while it ran). Null means leave the item alone.
 */
export function withCutOutPhoto(latest: ClothingItem | undefined, original: string, cutOut: string | null, now: Date): ClothingItem | null {
  if (!cutOut || !latest || latest.photo !== original) return null;
  return { ...latest, photo: cutOut, updatedAt: now.toISOString() };
}
