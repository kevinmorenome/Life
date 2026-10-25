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

export type InboxRequest = WearRequest | TagRequest;

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
