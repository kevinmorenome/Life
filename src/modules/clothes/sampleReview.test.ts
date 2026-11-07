import { expect, it } from 'vitest';
import { itemsToReview } from './review';
import { sampleReviewItems } from './sampleReview';

it('sample items are all flagged for review, with unique ids', () => {
  const items = sampleReviewItems(new Date('2026-10-27T00:00:00Z'));
  expect(itemsToReview(items)).toHaveLength(items.length);
  expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
});
