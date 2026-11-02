import { describe, expect, it } from 'vitest';
import type { FoodReceipt } from '../food/types';
import { isWoltTakeoutReceipt, takeoutFromReceipt } from './fromReceipts';
import { mergeTakeout } from './useTakeoutOrders';

const r = (over: Partial<FoodReceipt> = {}): FoodReceipt => ({
  id: 'food-1a192a3885b9bfff', store: 'McDonald\'s', branch: 'Rotor', date: '2026-10-27', time: '22:32', total: 26.32,
  notes: 'Wolt delivery, restaurant order (no item detail in email)',
  lines: [{ name: 'Wolt order', kind: 'other', quantity: 1, unit: 'pc', unitPrice: 26.32, discount: 0, paid: 26.32 }],
  createdAt: 'a', updatedAt: 'b', ...over,
});

describe('Wolt receipts in the food log', () => {
  it('recognises only the one-line Wolt orders', () => {
    expect(isWoltTakeoutReceipt(r())).toBe(true);
    expect(isWoltTakeoutReceipt(r({ notes: 'Konzum' }))).toBe(false);
    expect(isWoltTakeoutReceipt(r({ lines: [...r().lines, ...r().lines] }))).toBe(false);
    expect(isWoltTakeoutReceipt(r({ lines: [{ ...r().lines[0], name: 'Milk' }] }))).toBe(false);
  });
  it('turns one into a takeout order', () => {
    expect(takeoutFromReceipt(r())).toEqual({ id: 'wolt-1a192a3885b9bfff', restaurant: "McDonald's - Rotor", date: '2026-10-27', time: '22:32', total: 26.32, currency: 'EUR', createdAt: 'a', updatedAt: 'b' });
    expect(takeoutFromReceipt(r({ branch: undefined })).restaurant).toBe("McDonald's");
  });
});

describe('mergeTakeout', () => {
  it('adds Wolt receipts not yet moved, once', () => {
    const saved = takeoutFromReceipt(r());
    const other = r({ id: 'food-2', date: '2026-10-28' });
    const grocery = r({ id: 'food-3', notes: 'Konzum' });
    const merged = mergeTakeout([saved], [r(), other, grocery]);
    expect(merged.map((o) => o.id)).toEqual(['wolt-1a192a3885b9bfff', 'wolt-2']);
  });
});
