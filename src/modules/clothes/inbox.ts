import type { InboxRequest, TagRequest, WearRequest } from '../../../worker/protocol';
import { outfitPieces, wearOutfit } from './outfits';
import type { ClothingItem, Outfit } from './types';
import { withWear } from './wear';

/** Applied requests are kept briefly (so the server can see they were handled), then pruned. */
const KEEP_APPLIED_DAYS = 14;

export interface InboxResult {
  /** Records to save. */
  items: ClothingItem[];
  outfits: Outfit[];
  /** Requests to save, now marked applied. */
  requests: InboxRequest[];
  /** Applied requests old enough to delete. */
  expired: string[];
}

/** Adds the tags that aren't there yet (compared ignoring case); returns the same record if none are new. */
export function withTags<T extends { tags?: string[]; updatedAt: string }>(record: T, tags: string[]): T {
  const have = new Set((record.tags ?? []).map((t) => t.toLowerCase()));
  const fresh = tags.filter((t, i) => !have.has(t.toLowerCase()) && tags.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);
  if (fresh.length === 0) return record;
  return { ...record, tags: [...(record.tags ?? []), ...fresh], updatedAt: new Date().toISOString() };
}

/**
 * Applies queued requests with the same rules as the app itself. Wears:
 * wearing an outfit logs its pieces too, and anything already logged on that
 * date is skipped. Tags: only added, never removed. Both are idempotent, so
 * applying twice (e.g. from two devices) changes nothing. Ids that no longer
 * exist are reported on the request, not fatal.
 */
export function applyInbox(requests: InboxRequest[], allItems: ClothingItem[], allOutfits: Outfit[], now: Date): InboxResult {
  const items = new Map(allItems.map((i) => [i.id, i]));
  const outfits = new Map(allOutfits.map((o) => [o.id, o]));
  const changedItems = new Set<string>();
  const changedOutfits = new Set<string>();
  const applied: InboxRequest[] = [];

  const pending = requests.filter((r) => (r.type === 'wear' || r.type === 'tags') && !r.appliedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const req of pending) {
    const missing: string[] = [];
    if (req.type === 'tags') {
      applyTags(req, items, outfits, changedItems, changedOutfits, missing);
    } else {
      applyWear(req, items, outfits, changedItems, changedOutfits, missing);
    }
    applied.push({
      ...req,
      appliedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      ...(missing.length ? { error: `No longer exist: ${missing.join(', ')}` } : {}),
    });
  }

  const cutoff = new Date(now.getTime() - KEEP_APPLIED_DAYS * 86_400_000).toISOString();
  return {
    items: [...changedItems].map((id) => items.get(id)!),
    outfits: [...changedOutfits].map((id) => outfits.get(id)!),
    requests: applied,
    expired: requests.filter((r) => r.appliedAt && r.appliedAt < cutoff).map((r) => r.id),
  };
}

type Records = { items: Map<string, ClothingItem>; outfits: Map<string, Outfit> };

function applyTags(
  req: TagRequest,
  items: Records['items'],
  outfits: Records['outfits'],
  changedItems: Set<string>,
  changedOutfits: Set<string>,
  missing: string[],
) {
  for (const id of req.outfitIds) {
    const o = outfits.get(id);
    if (!o) {
      missing.push(id);
      continue;
    }
    const next = withTags(o, req.tags);
    if (next !== o) {
      outfits.set(id, next);
      changedOutfits.add(id);
    }
  }
  for (const id of req.itemIds) {
    const i = items.get(id);
    if (!i) {
      missing.push(id);
      continue;
    }
    const next = withTags(i, req.tags);
    if (next !== i) {
      items.set(id, next);
      changedItems.add(id);
    }
  }
}

function applyWear(
  req: WearRequest,
  items: Records['items'],
  outfits: Records['outfits'],
  changedItems: Set<string>,
  changedOutfits: Set<string>,
  missing: string[],
) {
  for (const id of req.outfitIds) {
    const outfit = outfits.get(id);
    if (!outfit) {
      missing.push(id);
      continue;
    }
    const r = wearOutfit(outfit, outfitPieces(outfit, [...items.values()]), req.date);
    if (r.outfit) {
      outfits.set(id, r.outfit);
      changedOutfits.add(id);
    }
    for (const p of r.pieces) {
      items.set(p.id, p);
      changedItems.add(p.id);
    }
  }
  for (const id of req.itemIds) {
    const item = items.get(id);
    if (!item) {
      missing.push(id);
      continue;
    }
    if (item.wears.includes(req.date)) continue;
    items.set(id, withWear(item, req.date));
    changedItems.add(id);
  }
}
