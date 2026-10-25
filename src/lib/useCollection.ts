import { useCallback, useEffect, useState } from 'react';
import { getAll, put, remove, type Entity, type StoreName } from './db';

/** Loads a whole store into React state and keeps it in sync on writes. */
export function useCollection<T extends Entity>(store: StoreName) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAll<T>(store).then((all) => {
      if (!cancelled) {
        setItems(all);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const save = useCallback(
    async (item: T) => {
      await put(store, item);
      setItems((prev) => {
        const i = prev.findIndex((p) => p.id === item.id);
        if (i === -1) return [...prev, item];
        const next = prev.slice();
        next[i] = item;
        return next;
      });
    },
    [store],
  );

  const del = useCallback(
    async (id: string) => {
      await remove(store, id);
      setItems((prev) => prev.filter((p) => p.id !== id));
    },
    [store],
  );

  return { items, loading, save, remove: del };
}
