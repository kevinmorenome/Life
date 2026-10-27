import { describe, expect, it } from 'vitest';
import type { InboxRecord } from '../../../worker/protocol';
import { draftToItem, pendingDrafts } from './receipts';

const draft = (id: string, createdAt: string): InboxRecord => ({ id, type: 'receipt-draft', subject: id, items: [], source: 'email', createdAt, updatedAt: createdAt });

describe('receipts', () => {
  it('lists only drafts, oldest first', () => {
    const wear: InboxRecord = { id: 'w', type: 'wear', date: '2026-01-01', itemIds: [], outfitIds: [], source: 'mcp', createdAt: '', updatedAt: '' };
    expect(pendingDrafts([draft('b', '2026-02-01'), wear, draft('a', '2026-01-01')]).map((d) => d.id)).toEqual(['a', 'b']);
  });
  it('turns a draft line into a fresh item', () => {
    const item = draftToItem({ name: 'Polo', category: 'tops', brand: 'Lacoste', colors: ['Navy', 'White'], price: 80, purchaseDate: '2026-10-01' }, 'x', new Date('2026-10-02T00:00:00Z'));
    expect(item).toMatchObject({ id: 'x', name: 'Polo', category: 'tops', color: 'Navy, White', status: 'active', wears: [], price: 80 });
    expect(draftToItem({ name: 'Odd', category: 'nope' }, 'y', new Date()).category).toBe('other');
  });
});
