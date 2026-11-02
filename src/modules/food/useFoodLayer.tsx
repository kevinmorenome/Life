import { useMemo } from 'react';
import { CartIcon } from '../../icons';
import { money } from '../../lib/format';
import { href } from '../../lib/router';
import { useCollection } from '../../lib/useCollection';
import { isWoltTakeoutReceipt } from '../wolt/fromReceipts';
import type { CalendarLayer } from '../types';
import { receiptTotal } from './food';
import type { FoodReceipt } from './types';

/** Grocery receipts by day, without Wolt takeout orders that still sit in the food log (the Takeout layer shows those). */
export function receiptsByDay(receipts: FoodReceipt[]): Map<string, FoodReceipt[]> {
  const days = new Map<string, FoodReceipt[]>();
  for (const r of receipts) {
    if (isWoltTakeoutReceipt(r)) continue;
    days.set(r.date, [...(days.get(r.date) ?? []), r]);
  }
  for (const list of days.values()) list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  return days;
}

/** Grocery shopping on the shared calendar: a mark on each day you shopped and the receipts on the day screen. */
export function useFoodCalendarLayer(): CalendarLayer {
  const { items } = useCollection<FoodReceipt>('foodreceipts');
  const days = useMemo(() => receiptsByDay(items), [items]);
  return {
    earliest: days.size ? [...days.keys()].sort()[0] : undefined,
    mark(date) {
      const list = days.get(date);
      if (!list) return null;
      const stores = list.map((r) => r.store);
      return { tone: 'food', icon: <CartIcon />, label: list.length === 1 ? stores[0] : `${list.length} shops`, detail: money(list.reduce((s, r) => s + receiptTotal(r), 0)), tiles: stores };
    },
    daySection(date) {
      const list = days.get(date);
      if (!list) return null;
      return (
        <section className="checkins-day">
          <h2>Groceries</h2>
          <ul>
            {list.map((r) => (
              <li key={r.id}>
                <span className="muted small">{r.time}</span>{' '}
                <a href={href(`/food/receipt/${r.id}`)}>
                  <strong>{r.store}</strong>
                </a>{' '}
                <span className="muted small">{[r.branch, money(receiptTotal(r)), `${r.lines.length} ${r.lines.length === 1 ? 'line' : 'lines'}`].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </section>
      );
    },
  };
}
