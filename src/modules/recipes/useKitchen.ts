import { useMemo } from 'react';
import { useSettings } from '../../lib/settings';
import { useCollection } from '../../lib/useCollection';
import { stockEvent } from '../food/stockActions';
import { stockEntries } from '../food/stockEntries';
import type { FoodProduct, FoodReceipt, StockEvent } from '../food/types';
import { stapleKey, stockMap } from './availability';

/**
 * What the recipes check against: every product ever bought (from the food module's receipts, no list of its own),
 * what is left of each today, and the pantry staples. `toggleStaple` adds or removes one by ingredient name.
 */
export function useKitchen() {
  const receipts = useCollection<FoodReceipt>('foodreceipts');
  const records = useCollection<FoodProduct>('foodproducts');
  const events = useCollection<StockEvent>('foodstock');
  const { settings, update } = useSettings();
  const entries = useMemo(() => stockEntries(receipts.items, records.items, events.items), [receipts.items, records.items, events.items]);
  const products = useMemo(() => entries.map((e) => e.product), [entries]);
  const stocked = useMemo(() => stockMap(entries), [entries]);
  const staples = useMemo(() => new Set(settings.pantryStaples ?? []), [settings.pantryStaples]);
  const toggleStaple = (name: string) => {
    const key = stapleKey(name);
    const cur = settings.pantryStaples ?? [];
    return update({ pantryStaples: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key].sort() });
  };
  /** Takes what was used for a dish off the stock: fresh `use` events dated today, one per product (never edits). */
  const logUses = async (uses: { productId: string; quantity: number }[], note: string) => {
    for (const u of uses) await events.save({ ...stockEvent(u.productId, 'use', u.quantity, 'app'), note });
  };
  return { loading: receipts.loading || records.loading || events.loading, products, stocked, staples, toggleStaple, logUses };
}

export type Kitchen = ReturnType<typeof useKitchen>;
