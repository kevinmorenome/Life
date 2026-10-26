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
      return (STATUSES as readonly string[]).includes(v) ? { ...next, status: v as Status } : null;
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

/** Distinct brands already used in the closet, case-insensitively de-duplicated, sorted A–Z. */
export function brandsOf(items: ClothingItem[]): string[] {
  const seen = new Map<string, string>();
  for (const i of items) {
    const b = i.brand?.trim();
    if (b && !seen.has(b.toLowerCase())) seen.set(b.toLowerCase(), b);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
