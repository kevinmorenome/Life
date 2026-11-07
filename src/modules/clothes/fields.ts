import { today } from '../../lib/format';
import { withStatus } from './lifecycle';
import { CATEGORIES, CONDITIONS, STATUSES, type Category, type ClothingItem, type Condition, type Status } from './types';

export type FieldKey =
  | 'name'
  | 'category'
  | 'subcategory'
  | 'brand'
  | 'size'
  | 'material'
  | 'price'
  | 'purchaseDate'
  | 'status'
  | 'condition'
  | 'notes';

/**
 * Applies one edited field to an item. `raw` is the text from the editor; blank clears optional fields.
 * Returns `null` when the value isn't valid (blank name, negative or non-numeric price, unknown option).
 */
export function withField(item: ClothingItem, key: FieldKey, raw: string): ClothingItem | null {
  const v = raw.trim();
  const next = { ...item, updatedAt: new Date().toISOString() };
  switch (key) {
    case 'name':
      return v ? { ...next, name: v } : null;
    case 'category':
      return (CATEGORIES as readonly string[]).includes(v) ? { ...next, category: v as Category } : null;
    case 'status':
      return (STATUSES as readonly string[]).includes(v) ? withStatus(next, v as Status, today()) : null;
    case 'condition':
      if (!v) return { ...next, condition: undefined };
      return (CONDITIONS as readonly string[]).includes(v) ? { ...next, condition: v as Condition } : null;
    case 'price': {
      if (!v) return { ...next, price: undefined };
      const n = Number(v.replace(',', '.'));
      return Number.isNaN(n) || n < 0 ? null : { ...next, price: n };
    }
    default:
      return { ...next, [key]: v || undefined };
  }
}

/** Distinct values of a text field already used in the closet (plus `extra`), case-insensitively de-duplicated, sorted A–Z. */
export function valuesOf(items: ClothingItem[], key: 'brand' | 'size' | 'material' | 'subcategory', extra: string[] = []): string[] {
  const seen = new Map<string, string>();
  for (const raw of [...extra, ...items.map((i) => i[key])]) {
    const v = raw?.trim();
    if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export const brandsOf = (items: ClothingItem[]) => valuesOf(items, 'brand');
