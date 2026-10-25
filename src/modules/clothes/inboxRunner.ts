import type { InboxRequest } from '../../../worker/protocol';
import { getAll, notify, put, remove } from '../../lib/db';
import { applyInbox } from './inbox';
import type { ClothingItem, Outfit } from './types';

/** Applies wear requests queued by other clients (e.g. Claude over MCP). Run after each sync pull. */
export async function processInbox(): Promise<void> {
  const requests = await getAll<InboxRequest>('inbox');
  if (requests.length === 0) return;
  const [items, outfits] = await Promise.all([getAll<ClothingItem>('clothes'), getAll<Outfit>('outfits')]);

  const result = applyInbox(requests, items, outfits, new Date());
  // Wears first, then mark the requests applied: a crash in between just re-applies them harmlessly.
  for (const o of result.outfits) await put('outfits', o);
  for (const i of result.items) await put('clothes', i);
  for (const r of result.requests) await put('inbox', r);
  for (const id of result.expired) await remove('inbox', id);

  if (result.outfits.length) notify('outfits');
  if (result.items.length) notify('clothes');
}
