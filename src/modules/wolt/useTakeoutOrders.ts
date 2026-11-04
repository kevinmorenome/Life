import { useMemo } from 'react';
import { useCollection } from '../../lib/useCollection';
import type { FoodReceipt } from '../food/types';
import { isWoltTakeoutReceipt, takeoutFromReceipt } from './fromReceipts';
import type { WoltOrder } from './types';

/** Saved takeout orders plus Wolt orders still sitting in the food log, so nothing waits on the move. */
export function mergeTakeout(orders: WoltOrder[], receipts: FoodReceipt[]): WoltOrder[] {
  const known = new Set(orders.map((o) => o.id));
  const fromReceipts = receipts.filter(isWoltTakeoutReceipt).map(takeoutFromReceipt).filter((o) => !known.has(o.id));
  return [...orders, ...fromReceipts];
}

export function useTakeoutOrders(): { items: WoltOrder[]; loading: boolean } {
  const orders = useCollection<WoltOrder>('woltorders');
  const receipts = useCollection<FoodReceipt>('foodreceipts');
  const items = useMemo(() => mergeTakeout(orders.items, receipts.items), [orders.items, receipts.items]);
  return { items, loading: orders.loading || receipts.loading };
}
