import type { InboxRecord, ReceiptDraft, ReceiptDraftItem } from '../../../worker/protocol';
import { CATEGORIES, type Category, type ClothingItem } from './types';

/** Drafts from forwarded receipts that haven't been accepted or dismissed yet, oldest first. */
export function pendingDrafts(records: InboxRecord[]): ReceiptDraft[] {
  return records
    .filter((r): r is ReceiptDraft => r.type === 'receipt-draft')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** A fresh ClothingItem (new id, no wears, no photo) from a draft line. */
export function draftToItem(draft: ReceiptDraftItem, id: string, now: Date): ClothingItem {
  const colors = draft.colors?.length ? draft.colors : undefined;
  const stamp = now.toISOString();
  return {
    id,
    name: draft.name,
    category: (CATEGORIES as readonly string[]).includes(draft.category) ? (draft.category as Category) : 'other',
    subcategory: draft.subcategory,
    brand: draft.brand,
    colors,
    color: colors?.join(', '),
    size: draft.size,
    seasons: [],
    price: draft.price,
    purchaseDate: draft.purchaseDate,
    status: 'active',
    wears: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}
