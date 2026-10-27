import { describe, expect, it } from 'vitest';
import { itemsToReview, reviewQueue, markReviewed, reviewSummary } from './review';
import type { ClothingItem } from './types';

const item = (id: string, createdAt: string, extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id, name: id, category: 'tops', seasons: [], status: 'active', wears: [], createdAt, updatedAt: createdAt, ...extra,
});

describe('review', () => {
  it('lists only flagged items, newest first', () => {
    const all = [item('a', '2026-01-01', { needsReview: true }), item('b', '2026-01-02'), item('c', '2026-01-03', { needsReview: true })];
    expect(itemsToReview(all).map((i) => i.id)).toEqual(['c', 'a']);
  });
  it('queues flagged items oldest first, skipping the ones put off', () => {
    const all = [item('c', '2026-01-03', { needsReview: true }), item('b', '2026-01-02', { needsReview: true }), item('a', '2026-01-01', { needsReview: true }), item('d', '2026-01-04')];
    expect(reviewQueue(all, new Set()).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(reviewQueue(all, new Set(['a'])).map((i) => i.id)).toEqual(['b', 'c']);
  });
  it('clears the flag and bumps updatedAt, keeping everything else', () => {
    const flagged = item('a', '2026-01-01', { needsReview: true, tags: ['x'] });
    const done = markReviewed(flagged, new Date('2026-02-01T00:00:00Z'));
    expect(done.needsReview).toBeUndefined();
    expect('needsReview' in done).toBe(false);
    expect(done).toMatchObject({ id: 'a', tags: ['x'], updatedAt: '2026-02-01T00:00:00.000Z' });
  });
  it('summarises the details from the email', () => {
    const s = reviewSummary(item('a', '2026-01-01', { brand: 'Lacoste', subcategory: 'Polo shirt', colors: ['Navy'], size: 'M', purchaseDate: '2026-10-01' }));
    expect(s).toBe('Lacoste · Polo shirt · Navy · Size M · 2026-10-01');
  });
});
