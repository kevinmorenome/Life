import type { ClothingItem, Status } from './types';

/** Statuses meaning the item has left the closet for good. */
export const RETIRED: readonly Status[] = ['donated', 'sold', 'discarded'];

export function isRetired(item: Pick<ClothingItem, 'status'>): boolean {
  return RETIRED.includes(item.status);
}

/** The `retiredDate` after a status change: stamped on leaving the closet, kept between retired statuses, cleared on return. */
export function retiredDateFor(prev: Pick<ClothingItem, 'status' | 'retiredDate'> | undefined, status: Status, today: string): string | undefined {
  if (!RETIRED.includes(status)) return undefined;
  return prev && isRetired(prev) ? prev.retiredDate : today;
}

export function withStatus(item: ClothingItem, status: Status, today: string): ClothingItem {
  return { ...item, status, retiredDate: retiredDateFor(item, status, today) };
}
