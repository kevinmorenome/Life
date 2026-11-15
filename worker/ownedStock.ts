// Turns what Claude saw on a photo (or was told) about things the user already owned before they started tracking
// into carried-over receipts (see the `add_owned_stock` tool). The input is untrusted: every field is validated.
import { LINE_KINDS, PRODUCT_TYPES, STORAGES, UNITS, type LineKind, type ProductType, type Storage, type Unit } from '../src/modules/food/types';
import { isRealDate } from './groceries';

const MAX_ITEMS = 40;

/** The store name carried-over stock is filed under. It never reaches a statistic, but shows on the receipt page. */
export const OWNED_STORE = 'Owned before the app';

export interface OwnedItem {
  name: string;
  rawName?: string;
  /** Only things you stock: food, alcohol or household & care. */
  kind: Extract<LineKind, 'food' | 'alcohol' | 'household'>;
  quantity: number;
  unit: Unit;
  type?: ProductType;
  storage?: Storage;
  shelfLifeDays?: number;
  packSize?: number;
  packLabel?: string;
  /** The use-by date printed on the pack, YYYY-MM-DD. */
  useBy?: string;
}

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
};

export function parseOwnedItems(input: unknown): { items: OwnedItem[]; rejected: string[] } {
  const items: OwnedItem[] = [];
  const rejected: string[] = [];
  if (!Array.isArray(input)) return { items, rejected };
  for (const raw of input.slice(0, MAX_ITEMS)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const name = str(r.name, 200);
    const quantity = typeof r.quantity === 'number' && Number.isFinite(r.quantity) && r.quantity > 0 && r.quantity <= 10_000 ? Math.round(r.quantity * 1000) / 1000 : undefined;
    if (!name || quantity === undefined) {
      rejected.push(name ?? 'an item without a name');
      continue;
    }
    const kind = (LINE_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as LineKind) : 'food';
    items.push({
      name,
      rawName: str(r.rawName, 200),
      kind: kind === 'alcohol' || kind === 'household' ? kind : 'food',
      quantity,
      unit: (UNITS as readonly string[]).includes(r.unit as string) ? (r.unit as Unit) : 'pc',
      type: (PRODUCT_TYPES as readonly string[]).includes(r.productType as string) ? (r.productType as ProductType) : undefined,
      storage: (STORAGES as readonly string[]).includes(r.storage as string) ? (r.storage as Storage) : undefined,
      shelfLifeDays: typeof r.shelfLifeDays === 'number' && Number.isFinite(r.shelfLifeDays) && r.shelfLifeDays >= 1 && r.shelfLifeDays <= 3650 ? Math.round(r.shelfLifeDays) : undefined,
      packSize: typeof r.packSize === 'number' && Number.isFinite(r.packSize) && r.packSize >= 2 && r.packSize <= 100 ? Math.round(r.packSize) : undefined,
      packLabel: str(r.packLabel, 20),
      useBy: isRealDate(r.useBy) ? r.useBy : undefined,
    });
  }
  return { items, rejected };
}
