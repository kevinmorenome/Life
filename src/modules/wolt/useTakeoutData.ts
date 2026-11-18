import { useCallback, useMemo } from 'react';
import { useCollection } from '../../lib/useCollection';
import { dishKey, dishLines, latestFeedback, latestShares, mergeFeedback, type DishLine } from './dishes';
import type { DishFeedback, DishGroup, OrderShare, TakeoutDetail, WoltOrder } from './types';
import { useTakeoutOrders } from './useTakeoutOrders';

/** Orders, their item lines, your dish groups and likes, and the writes for the last two. */
export function useTakeoutData() {
  const { items: orders, loading: l1 } = useTakeoutOrders();
  const details = useCollection<TakeoutDetail>('takeoutdetails');
  const groups = useCollection<DishGroup>('dishgroups');
  const feedback = useCollection<DishFeedback>('dishfeedback');
  const shareRows = useCollection<OrderShare>('ordershares');
  const shares = useMemo(() => latestShares(shareRows.items), [shareRows.items]);
  const lines = useMemo(() => dishLines(orders, details.items, groups.items, shares), [orders, details.items, groups.items, shares]);
  const dishOf = useMemo(() => new Map(lines.map((l) => [l.key, l.dish])), [lines]);
  const verdicts = useMemo(() => latestFeedback(feedback.items), [feedback.items]);
  const detailOf = useMemo(() => new Map(details.items.map((d) => [d.orderId, d])), [details.items]);

  /** Saves a like / dislike and/or note for a dish (a new record; the newest wins, so a note keeps the verdict). */
  const { save: saveFeedback } = feedback;
  const rate = useCallback(
    async (venue: string, raw: string, change: { verdict?: DishFeedback['verdict'] | null; note?: string }) => {
      const key = dishKey(venue, raw);
      const cur = latestFeedback(feedback.items).get(key);
      const now = new Date().toISOString();
      const merged = mergeFeedback(cur, change);
      await saveFeedback({ id: `dfb-${crypto.randomUUID()}`, key, venue, dish: raw, ...merged, at: now, createdAt: now, updatedAt: now });
    },
    [feedback.items, saveFeedback],
  );

  /** How many of one line were yours (a new share record for the order, keeping its other lines). */
  const { save: saveShare } = shareRows;
  const setMine = useCallback(
    async (orderId: string, index: number, qty: number, mine: number) => {
      const mineMap = { ...(shares.get(orderId) ?? {}) };
      if (mine >= qty) delete mineMap[String(index)];
      else mineMap[String(index)] = Math.max(0, mine);
      const now = new Date().toISOString();
      await saveShare({ id: `os-${crypto.randomUUID()}`, orderId, mine: mineMap, at: now, createdAt: now, updatedAt: now });
    },
    [shares, saveShare],
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

  return { orders: orders as WoltOrder[], details: details.items, detailOf, dishOf, shares, setMine, lines, verdicts, rate, regroup, loading: l1 || details.loading || groups.loading || feedback.loading || shareRows.loading };
}
