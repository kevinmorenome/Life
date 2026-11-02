import { STORAGES } from './types';
import type { Entry } from './stockEntries';

/** The products you have that still have no picture: the fridge first, then the pantry, then the freezer, each by name. */
export function needsPicture(entries: Entry[]): Entry[] {
  return entries
    .filter((e) => !e.product.photo && e.stock.quantity > 0)
    .sort((a, b) => STORAGES.indexOf(a.product.storage) - STORAGES.indexOf(b.product.storage) || a.product.name.localeCompare(b.product.name));
}
