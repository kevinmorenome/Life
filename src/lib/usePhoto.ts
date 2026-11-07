import { useEffect, useState } from 'react';
import { getPhoto, onPhotoChange, type StoreName } from './db';

type Pictured = { id: string; photo?: string; hasPhoto?: boolean };

/**
 * A record's picture. Records read from the store carry `hasPhoto`, not the image, so it is loaded from the
 * photos store (cached, and refreshed when the picture changes). A record that still holds its image in
 * memory (a draft, a sample) just uses that.
 */
export function usePhoto(store: StoreName, record: Pictured | undefined): string | undefined {
  const id = record?.id;
  const inline = record?.photo;
  const has = !!record?.hasPhoto;
  const [loaded, setLoaded] = useState<{ id: string; data?: string }>();

  useEffect(() => {
    if (!id || inline || !has) return;
    let cancelled = false;
    const load = () =>
      void getPhoto(store, id).then((data) => {
        if (!cancelled) setLoaded({ id, data });
      });
    load();
    const off = onPhotoChange(store, id, load);
    return () => {
      cancelled = true;
      off();
    };
  }, [store, id, inline, has]);

  if (inline) return inline;
  return has && loaded && loaded.id === id ? loaded.data : undefined;
}
