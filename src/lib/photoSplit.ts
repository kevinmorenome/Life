// Pictures live apart from their records on this device: a record in a "photo store" keeps only
// `hasPhoto: true` and the image sits in the local `photos` store, loaded one at a time. The server,
// sync and backups still see the full record with its `photo` data URL (see db.ts).

/** Stores whose records can carry a `photo`. */
export const PHOTO_STORES = ['clothes', 'foodproducts', 'recipes'] as const;
export const isPhotoStore = (store: string): boolean => (PHOTO_STORES as readonly string[]).includes(store);

export const photoKey = (store: string, id: string): string => `${store}:${id}`;

type WithPhoto = { photo?: string; hasPhoto?: boolean };

export type PhotoAction =
  | { kind: 'set'; data: string }
  | { kind: 'keep' }
  | { kind: 'remove' };

/**
 * Splits a record about to be saved into what stays in the store and what happens to its image:
 * - a `photo` string is stored (and replaces any earlier one),
 * - no `photo` but `hasPhoto: true` (a record read from the store, edited and saved) keeps the stored image,
 * - otherwise the record has no picture (callers remove one by setting `hasPhoto: false`).
 */
export function splitPhoto<T extends WithPhoto>(value: T): { local: Omit<T, 'photo'>; action: PhotoAction } {
  const { photo, ...rest } = value;
  if (typeof photo === 'string' && photo) return { local: { ...rest, hasPhoto: true }, action: { kind: 'set', data: photo } };
  if (value.hasPhoto === true) return { local: rest, action: { kind: 'keep' } };
  const { hasPhoto: _drop, ...clean } = rest;
  return { local: clean as Omit<T, 'photo'>, action: { kind: 'remove' } };
}

/** The full record as the server and backups know it: the image back in, the local flag gone. */
export function joinPhoto<T extends WithPhoto>(local: T, data: string | undefined): T {
  const { hasPhoto: _flag, ...rest } = local;
  return (data ? { ...rest, photo: data } : rest) as T;
}
