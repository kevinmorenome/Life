import type { InboxRequest, ProductChanges, ProductEditRequest } from '../../../worker/protocol';
import { PRODUCT_TYPES, STORAGES, type FoodProduct, type ProductType, type Storage } from './types';

const KEEP_APPLIED_DAYS = 14;

/**
 * Checks edits that arrive from outside the app (Claude): unknown or out-of-range values are rejected with a
 * message, so a request never carries something the product page itself would not allow.
 */
export function parseProductChanges(input: Record<string, unknown>): ProductChanges | string {
  const out: ProductChanges = {};
  if (input.type !== undefined) {
    if (!(PRODUCT_TYPES as readonly string[]).includes(input.type as string)) return `type must be one of ${PRODUCT_TYPES.join(', ')}.`;
    out.type = input.type as ProductType;
  }
  if (input.storage !== undefined) {
    if (!(STORAGES as readonly string[]).includes(input.storage as string)) return `storage must be one of ${STORAGES.join(', ')}.`;
    out.storage = input.storage as Storage;
  }
  if (input.shelfLifeDays !== undefined) {
    const d = input.shelfLifeDays;
    if (d === null) out.shelfLifeDays = null;
    else if (typeof d === 'number' && Number.isFinite(d) && d >= 1 && d <= 3650) out.shelfLifeDays = Math.round(d);
    else return 'shelfLifeDays must be a whole number of days from 1 to 3650 (or null to clear it).';
  }
  if (input.packSize !== undefined) {
    const n = input.packSize;
    if (n === null) out.packSize = null;
    else if (typeof n === 'number' && Number.isFinite(n) && n >= 2 && n <= 100) out.packSize = Math.round(n);
    else return 'packSize must be a whole number from 2 to 100 (items in one pack), or null to clear it.';
  }
  if (input.packLabel !== undefined) {
    if (input.packLabel === null) out.packLabel = null;
    else if (typeof input.packLabel === 'string' && input.packLabel.trim() && input.packLabel.trim().length <= 20) out.packLabel = input.packLabel.trim();
    else return 'packLabel must be a short word (at most 20 characters), e.g. "can", or null to clear it.';
  }
  return Object.keys(out).length ? out : 'Nothing to change: give at least one of type, storage, shelfLifeDays, packSize, packLabel.';
}

/** The product with the changes applied, or the same object when they change nothing. Idempotent. */
export function withProductChanges(rec: FoodProduct, c: ProductChanges, now: string): FoodProduct {
  const next: FoodProduct = { ...rec };
  if (c.type && (PRODUCT_TYPES as readonly string[]).includes(c.type)) next.type = c.type as ProductType;
  if (c.storage && (STORAGES as readonly string[]).includes(c.storage)) next.storage = c.storage as Storage;
  if (c.shelfLifeDays !== undefined) next.shelfLifeDays = c.shelfLifeDays ?? undefined;
  if (c.packSize !== undefined) next.packSize = c.packSize ?? undefined;
  if (c.packLabel !== undefined) next.packLabel = c.packLabel ?? undefined;
  if (c.photo !== undefined) {
    next.photo = c.photo ?? undefined;
    next.hasPhoto = !!c.photo;
  }
  const same = (Object.keys({ ...rec, ...next }) as (keyof FoodProduct)[]).every((k) => k === 'updatedAt' || rec[k] === next[k]);
  return same ? rec : { ...next, updatedAt: now };
}

/** The record to save for a product: what is already there, the product as shown (so a first change creates the record with its defaults) and the change. */
export function productRecord(
  product: { id: string; name: string; type: ProductType; storage: Storage; shelfLifeDays?: number; packSize?: number; packLabel?: string; hasPhoto?: boolean },
  record: FoodProduct | undefined,
  patch: Partial<FoodProduct>,
  now: string,
): FoodProduct {
  return {
    ...record,
    id: product.id,
    name: record?.name ?? product.name,
    type: product.type,
    storage: product.storage,
    shelfLifeDays: product.shelfLifeDays,
    packSize: product.packSize,
    packLabel: product.packLabel,
    hasPhoto: product.hasPhoto,
    createdAt: record?.createdAt ?? now,
    ...patch,
    updatedAt: now,
  };
}

export interface ProductEditsResult {
  /** Products to save (records changed or created). */
  products: FoodProduct[];
  /** Requests to save, now marked applied. */
  requests: InboxRequest[];
  /** Applied requests old enough to delete. */
  expired: string[];
}

/**
 * Applies `product-edit` requests queued by Claude: only the fields given change, a product without a record gets
 * one built from `base`, and applying twice changes nothing. Other request types are left to the clothes inbox.
 */
export function applyProductEdits(requests: InboxRequest[], records: FoodProduct[], now: Date): ProductEditsResult {
  const mine = requests.filter((r): r is ProductEditRequest => r.type === 'product-edit');
  const byId = new Map(records.map((p) => [p.id, p]));
  const changed = new Set<string>();
  const applied: InboxRequest[] = [];
  const stamp = now.toISOString();

  for (const req of mine.filter((r) => !r.appliedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const rec: FoodProduct =
      byId.get(req.productId) ??
      ({ id: req.productId, name: req.base.name, type: req.base.type as ProductType, storage: req.base.storage as Storage, createdAt: stamp, updatedAt: stamp } as FoodProduct);
    const next = withProductChanges(rec, req.changes, stamp);
    if (next !== rec || !byId.has(req.productId)) {
      byId.set(req.productId, next);
      changed.add(req.productId);
    }
    // The picture now lives on the product; don't keep a second copy in the inbox.
    applied.push({ ...req, changes: { ...req.changes, photo: undefined }, appliedAt: stamp, updatedAt: stamp });
  }

  const cutoff = new Date(now.getTime() - KEEP_APPLIED_DAYS * 86_400_000).toISOString();
  return {
    products: [...changed].map((id) => byId.get(id)!),
    requests: applied,
    expired: mine.filter((r) => r.appliedAt && r.appliedAt < cutoff).map((r) => r.id),
  };
}
