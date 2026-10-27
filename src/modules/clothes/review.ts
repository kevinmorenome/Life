import { money } from '../../lib/format';
import { itemColors } from './colors';
import { label, type ClothingItem } from './types';

/** Items added automatically (e.g. from receipts) that the owner hasn't checked yet, newest first. */
export function itemsToReview(items: ClothingItem[]): ClothingItem[] {
  return items.filter((i) => i.needsReview).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
