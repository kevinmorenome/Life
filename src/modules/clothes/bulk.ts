import { withStatus } from './lifecycle';
import type { ClothingItem, Status } from './types';

/** Items among `ids` whose status actually changes, with the new status and a fresh `updatedAt`. */
export function withStatusFor(items: ClothingItem[], ids: ReadonlySet<string>, status: Status, now: string): ClothingItem[] {
  return items.filter((i) => ids.has(i.id) && i.status !== status).map((i) => ({ ...withStatus(i, status, now.slice(0, 10)), updatedAt: now }));
}
