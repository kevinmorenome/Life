// Shared between the Worker and the browser sync client.

export interface Change {
  store: string;
  id: string;
  /** JSON-encoded record, or null for a deletion. */
  data: string | null;
  /** Client clock (ms) of the edit; the newest edit wins. */
  updatedAt: number;
}

export interface PushRequest {
  changes: Change[];
}

export interface PullResponse {
  changes: Change[];
  cursor: number;
  more: boolean;
}

/**
 * A request queued in the `inbox` store by something other than
 * the app (the MCP endpoint). The app applies it with its normal wear logic
 * after each pull, then marks it applied. Applying is idempotent.
 */
interface RequestBase {
  id: string;
  itemIds: string[];
  outfitIds: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
  /** Set by the app once the request is applied. */
  appliedAt?: string;
  /** Set by the app when some ids no longer exist. */
  error?: string;
}

/** Log a wear of items and/or whole outfits on a date. */
export interface WearRequest extends RequestBase {
  type: 'wear';
  /** YYYY-MM-DD */
  date: string;
}

/** Add tags (never remove) to items and/or outfits. */
export interface TagRequest extends RequestBase {
  type: 'tags';
  tags: string[];
}

/** Rename an outfit and/or change its pieces: `itemIds` are added, `removeItemIds` removed. `outfitIds` holds the one outfit. */
export interface OutfitEditRequest extends RequestBase {
  type: 'outfit-edit';
  name?: string;
  removeItemIds: string[];
}

/** Fields an item edit may set; `null` clears an optional field. Wears, photo and tags are never touched. */
export interface ItemChanges {
  name?: string;
  category?: string;
  subcategory?: string | null;
  brand?: string | null;
  colors?: string[] | null;
  size?: string | null;
  material?: string | null;
  price?: number | null;
  purchaseDate?: string | null;
  seasons?: string[];
  status?: string;
  condition?: string | null;
  notes?: string | null;
}

/** Change fields of one item (`itemIds` holds it). */
export interface ItemEditRequest extends RequestBase {
  type: 'item-edit';
  changes: ItemChanges;
}

/** Replace an item's photo with an image the Worker downloaded (`itemIds` holds the one item). The app drops `photo` once applied. */
export interface PhotoRequest extends RequestBase {
  type: 'photo';
  /** Image data URL. */
  photo?: string;
}

/** What may be changed about a food product; `null` clears an optional field. Same meaning as the fields of `FoodProduct`. */
export interface ProductChanges {
  type?: string;
  storage?: string;
  shelfLifeDays?: number | null;
  /** `false` = only "have it or out"; `true` = count how many. */
  trackAmount?: boolean;
  packSize?: number | null;
  packLabel?: string | null;
}

/**
 * Change what the app knows about a food product (`productId` is its `fp-<slug>` id). `base` is how the product
 * looked when this was queued, so the app can create the record if it has none yet. Applied by the app after a
 * pull (`applyProductEdits`), never written to the product record by the Worker.
 */
export interface ProductEditRequest extends RequestBase {
  type: 'product-edit';
  productId: string;
  base: { name: string; type: string; storage: string };
  changes: ProductChanges;
}

export type InboxRequest = WearRequest | TagRequest | OutfitEditRequest | ItemEditRequest | PhotoRequest | ProductEditRequest;

export const MAX_PUSH = 50;
export const PULL_LIMIT = 100;
/** D1 caps a row at 2 MB; leave headroom for the other columns. */
export const MAX_DATA_LENGTH = 1_900_000;

const NAME = /^[a-z][a-z0-9_-]{0,39}$/;

export function validateChanges(body: unknown): Change[] | string {
  if (typeof body !== 'object' || body === null || !Array.isArray((body as PushRequest).changes)) {
    return 'Body must be { changes: [...] }';
  }
  const changes = (body as PushRequest).changes;
  if (changes.length > MAX_PUSH) return `At most ${MAX_PUSH} changes per request`;
  for (const c of changes) {
    if (typeof c !== 'object' || c === null) return 'Invalid change';
    if (typeof c.store !== 'string' || !NAME.test(c.store)) return 'Invalid store';
    if (typeof c.id !== 'string' || c.id.length === 0 || c.id.length > 100) return 'Invalid id';
    if (c.data !== null && (typeof c.data !== 'string' || c.data.length > MAX_DATA_LENGTH)) {
      return 'Invalid or oversized data';
    }
    if (typeof c.updatedAt !== 'number' || !Number.isFinite(c.updatedAt)) return 'Invalid updatedAt';
  }
  return changes;
}
