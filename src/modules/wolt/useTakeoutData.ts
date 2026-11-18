import { useCallback, useMemo } from 'react';
import { useCollection } from '../../lib/useCollection';
import { dishKey, dishLines, latestFeedback, type DishLine } from './dishes';
import type { DishFeedback, DishGroup, TakeoutDetail, WoltOrder } from './types';
import { useTakeoutOrders } from './useTakeoutOrders';

/** Orders, their item lines, your dish groups and likes, and the writes for the last two. */
export function useTakeoutData() {
  const { items: orders, loading: l1 } = useTakeoutOrders();
  const details = useCollection<TakeoutDetail>('takeoutdetails');
  const groups = useCollection<DishGroup>('dishgroups');
  const feedback = useCollection<DishFeedback>('dishfeedback');
  const lines = useMemo(() => dishLines(orders, details.items, groups.items), [orders, details.items, groups.items]);
  const verdicts = useMemo(() => latestFeedback(feedback.items), [feedback.items]);
  const detailOf = useMemo(() => new Map(details.items.map((d) => [d.orderId, d])), [details.items]);

  /** Saves a like / dislike and/or note for a dish (a new record; the newest wins, so a note keeps the verdict). */
  const { save: saveFeedback } = feedback;
  const rate = useCallback(
    async (venue: string, raw: string, change: { verdict?: DishFeedback['verdict'] | null; note?: string }) => {
      const key = dishKey(venue, raw);
      const cur = latestFeedback(feedback.items).get(key);
      const now = new Date().toISOString();
      const verdict = change.verdict === undefined ? cur?.verdict : change.verdict ?? undefined;
      const note = change.note === undefined ? cur?.note : change.note.trim() || undefined;
      await saveFeedback({ id: `dfb-${crypto.randomUUID()}`, key, venue, dish: raw, ...(verdict ? { verdict } : {}), ...(note ? { note } : {}), at: now, createdAt: now, updatedAt: now });
    },
    [feedback.items, saveFeedback],
  );

  /** Gives a dish your own name (empty = back to the printed one). The printed name is never changed. */
  const { save: saveGroup, remove: removeGroup } = groups;
  const regroup = useCallback(
    async (line: Pick<DishLine, 'venue' | 'raw'>, group: string) => {
      const key = dishKey(line.venue, line.raw);
      const id = `dg-${key}`;
      const name = group.trim();
      if (!name || name === line.raw) return removeGroup(id);
      const now = new Date().toISOString();
      await saveGroup({ id, key, venue: line.venue, raw: line.raw, group: name, createdAt: groups.items.find((g) => g.id === id)?.createdAt ?? now, updatedAt: now });
    },
    [groups.items, saveGroup, removeGroup],
  );

  return { orders: orders as WoltOrder[], details: details.items, detailOf, lines, verdicts, rate, regroup, loading: l1 || details.loading || groups.loading || feedback.loading };
}
