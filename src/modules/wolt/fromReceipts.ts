import type { FoodReceipt } from '../food/types';
import type { WoltOrder } from './types';

/**
 * Wolt restaurant orders were first filed in the food log as one-line receipts ("Wolt order", kind other,
 * no item detail). They are takeout, not groceries, so they belong in Takeout and out of the food totals.
 */
export function isWoltTakeoutReceipt(r: FoodReceipt): boolean {
  return r.lines.length === 1 && r.lines[0].name === 'Wolt order' && (r.notes ?? '').startsWith('Wolt delivery');
}

/** The takeout order a Wolt receipt stands for: id `wolt-<email id>`, restaurant "Store - Branch". */
export function takeoutFromReceipt(r: FoodReceipt): WoltOrder {
  return {
    id: `wolt-${r.id.replace(/^food-/, '')}`,
    restaurant: r.branch ? `${r.store} - ${r.branch}` : r.store,
    date: r.date,
    time: r.time,
    total: r.total ?? r.lines[0].paid,
    currency: 'EUR', // older HRK orders were stored converted; the printed kuna amount stays in the receipt note
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
