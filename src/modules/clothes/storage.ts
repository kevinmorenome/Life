import type { ClothingItem, Status } from './types';

type Periods = ClothingItem['storedPeriods'];

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000);
}

/** Days spent in `storage` up to `today`; an open spell counts until today. */
export function storedDays(item: Pick<ClothingItem, 'storedPeriods'>, today: string): number {
  let total = 0;
  for (const p of item.storedPeriods ?? []) total += Math.max(0, daysBetween(p.from, p.to ?? today));
  return total;
}

/**
 * Changes an item's status and keeps `storedPeriods` in step: entering `storage` opens a spell,
 * leaving it closes the spell. Setting the status it already has is a no-op.
 */
export function withStatus(item: ClothingItem, status: Status, date: string): ClothingItem {
  if (item.status === status) return item;
  let periods: Periods = item.storedPeriods;
  if (status === 'storage') {
    periods = [...(periods ?? []), { from: date }];
  } else if (item.status === 'storage' && periods?.length) {
    periods = periods.map((p) => (p.to ? p : { ...p, to: date }));
  }
  return { ...item, status, storedPeriods: periods, updatedAt: new Date().toISOString() };
}

export const isStored = (item: Pick<ClothingItem, 'status'>) => item.status === 'storage';
