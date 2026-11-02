import { describe, expect, it } from 'vitest';
import type { InboxRequest, ProductEditRequest } from '../../../worker/protocol';
import { applyProductEdits, parseProductChanges, withProductChanges } from './productEdits';
import type { FoodProduct } from './types';

const rec = (over: Partial<FoodProduct> = {}): FoodProduct => ({ id: 'fp-beer', name: 'Beer', type: 'drink', storage: 'pantry', createdAt: 'c', updatedAt: 'u', ...over });
const req = (over: Partial<ProductEditRequest> = {}): ProductEditRequest => ({
  id: 'r1', type: 'product-edit', itemIds: [], outfitIds: [], source: 'claude', createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z',
  productId: 'fp-beer', base: { name: 'Beer', type: 'drink', storage: 'pantry' }, changes: { packSize: 6, packLabel: 'can' }, ...over,
});
const NOW = new Date('2026-11-02T12:00:00Z');

describe('parseProductChanges', () => {
  it('keeps valid fields and rounds numbers', () => {
    expect(parseProductChanges({ packSize: 5.6, packLabel: ' can ', storage: 'fridge', type: 'drink', shelfLifeDays: 9.4, trackAmount: false })).toEqual({
      packSize: 6, packLabel: 'can', storage: 'fridge', type: 'drink', shelfLifeDays: 9, trackAmount: false,
    });
  });
  it('lets null clear the optional ones', () => {
    expect(parseProductChanges({ packSize: null, packLabel: null, shelfLifeDays: null })).toEqual({ packSize: null, packLabel: null, shelfLifeDays: null });
  });
  it('rejects bad values with a message, and an empty edit', () => {
    for (const bad of [{ packSize: 1 }, { packSize: 101 }, { packSize: 'six' }, { type: 'dessert' }, { storage: 'attic' }, { shelfLifeDays: 0 }, { trackAmount: 'no' }, { packLabel: '' }, { packLabel: 'x'.repeat(21) }]) {
      expect(typeof parseProductChanges(bad as Record<string, unknown>)).toBe('string');
    }
    expect(typeof parseProductChanges({})).toBe('string');
  });
});

describe('withProductChanges', () => {
  it('changes only the fields given', () => {
    expect(withProductChanges(rec({ shelfLifeDays: 90 }), { packSize: 6 }, 'now')).toMatchObject({ packSize: 6, shelfLifeDays: 90, type: 'drink', updatedAt: 'now' });
  });
  it('clears with null and maps trackAmount like the product page', () => {
    const out = withProductChanges(rec({ packSize: 6, packLabel: 'can', trackAmount: false }), { packSize: null, packLabel: null, trackAmount: true }, 'now');
    expect(out.packSize).toBeUndefined();
    expect(out.packLabel).toBeUndefined();
    expect(out.trackAmount).toBeUndefined();
    expect(withProductChanges(rec(), { trackAmount: false }, 'now').trackAmount).toBe(false);
  });
  it('returns the same record when nothing changes', () => {
    const r = rec({ packSize: 6 });
    expect(withProductChanges(r, { packSize: 6 }, 'now')).toBe(r);
  });
});

describe('applyProductEdits', () => {
  it('applies the change to the existing record and marks the request applied', () => {
    const out = applyProductEdits([req()], [rec({ shelfLifeDays: 90 })], NOW);
    expect(out.products).toEqual([expect.objectContaining({ id: 'fp-beer', packSize: 6, packLabel: 'can', shelfLifeDays: 90 })]);
    expect(out.requests[0]).toMatchObject({ appliedAt: NOW.toISOString() });
  });
  it('creates the record from the base when the app has none', () => {
    const out = applyProductEdits([req()], [], NOW);
    expect(out.products[0]).toMatchObject({ id: 'fp-beer', name: 'Beer', type: 'drink', storage: 'pantry', packSize: 6, packLabel: 'can' });
  });
  it('applies in the order queued, so the later request wins', () => {
    const later = req({ id: 'r2', createdAt: '2026-11-01T11:00:00Z', changes: { packSize: 12 } });
    expect(applyProductEdits([later, req()], [rec()], NOW).products[0].packSize).toBe(12);
  });
  it('is idempotent: an applied request is not applied again', () => {
    const first = applyProductEdits([req()], [rec()], NOW);
    const again = applyProductEdits(first.requests, first.products, new Date('2026-11-03T00:00:00Z'));
    expect(again.products).toEqual([]);
    expect(again.requests).toEqual([]);
  });
  it('leaves other request types alone and prunes old applied ones', () => {
    const wear = { id: 'w', type: 'wear', itemIds: ['a'], outfitIds: [], date: '2026-11-01', source: 'claude', createdAt: 'x', updatedAt: 'x' } as InboxRequest;
    const old = req({ id: 'old', appliedAt: '2026-10-01T00:00:00Z' });
    const out = applyProductEdits([wear, old], [rec()], NOW);
    expect(out.requests).toEqual([]);
    expect(out.expired).toEqual(['old']);
  });
});
