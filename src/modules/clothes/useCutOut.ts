import { useEffect, useRef, useState } from 'react';
import { cutOutImage, resizeImage } from '../../lib/image';
import { withCutOutPhoto } from './review';
import type { ClothingItem } from './types';

/** Items whose photo has already been through the cut-out this page session (it is slow, so only once). */
const tried = new Set<string>();
/** Photos longer than this (data URL characters) are downscaled even when the cut-out can't run; the Worker stores receipt images as downloaded. */
const HEAVY_PHOTO = 250_000;

/**
 * Removes the background from an item's photo when it comes up (it keeps the original if that can't run),
 * saved only if the photo is still the one the cut-out was made from. Used wherever an item still needing
 * review is shown, so its photo looks right however it was opened. Returns whether it is working on `item` now.
 */
export function useCutOutOnOpen(
  item: ClothingItem | undefined,
  enabled: boolean,
  latest: (id: string) => ClothingItem | undefined,
  onSave: (item: ClothingItem) => Promise<void>,
): boolean {
  const latestRef = useRef(latest);
  latestRef.current = latest;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const [busyId, setBusyId] = useState<string>();

  const id = enabled && item?.photo ? item.id : undefined;
  useEffect(() => {
    if (!id || tried.has(id)) return;
    tried.add(id);
    const original = latestRef.current(id)?.photo;
    if (!original) return;
    setBusyId(id);
    (async () => {
      try {
        const blob = await (await fetch(original)).blob();
        let better: string | null = await cutOutImage(blob).catch(() => null);
        if (!better && original.length > HEAVY_PHOTO) better = await resizeImage(blob);
        const next = withCutOutPhoto(latestRef.current(id), original, better, new Date());
        if (next) await onSaveRef.current(next);
      } catch {
        // Offline the first time, or nothing found: the original photo stays.
      } finally {
        setBusyId((b) => (b === id ? undefined : b));
      }
    })();
  }, [id]);

  return !!id && busyId === id;
}
