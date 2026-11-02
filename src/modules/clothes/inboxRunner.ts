import type { InboxRequest } from '../../../worker/protocol';
import { getAll, notify, put, remove } from '../../lib/db';
import { itemPhoto } from '../../lib/image';
import { applyProductEdits } from '../food/productEdits';
import type { FoodProduct } from '../food/types';
import { applyInbox, preparePhotos } from './inbox';
import type { ClothingItem, Outfit } from './types';

/** Applies wear requests queued by other clients (e.g. Claude over MCP). Run after each sync pull. */
export async function processInbox(): Promise<void> {
  const all = await getAll<InboxRequest>('inbox');
  if (all.length === 0) return;
  // Food product edits have their own rules; everything else is the clothes inbox.
  const requests = all.filter((r) => r.type !== 'product-edit');
  await processProductEdits(all);
  if (requests.length === 0) return;
  const [items, outfits] = await Promise.all([getAll<ClothingItem>('clothes'), getAll<Outfit>('outfits')]);

  // Queued photos arrive as downloaded; downscale them (and remove the background when possible) like any other photo.
  const prepared = await preparePhotos(requests, async (url) => (await itemPhoto(await (await fetch(url)).blob())).photo);
  const result = applyInbox(prepared, items, outfits, new Date());
  // Wears first, then mark the requests applied: a crash in between just re-applies them harmlessly.
  for (const o of result.outfits) await put('outfits', o);
  for (const i of result.items) await put('clothes', i);
  for (const r of result.requests) await put('inbox', r);
  for (const id of result.expired) await remove('inbox', id);

  if (result.outfits.length) notify('outfits');
  if (result.items.length) notify('clothes');
}

/** Applies `product-edit` requests (Claude changing a food product that already has a record). */
async function processProductEdits(all: InboxRequest[]): Promise<void> {
  if (!all.some((r) => r.type === 'product-edit')) return;
  const result = applyProductEdits(all, await getAll<FoodProduct>('foodproducts'), new Date());
  for (const p of result.products) await put('foodproducts', p);
  for (const r of result.requests) await put('inbox', r);
  for (const id of result.expired) await remove('inbox', id);
  if (result.products.length) notify('foodproducts');
}
