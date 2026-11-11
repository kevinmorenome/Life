import { describe, expect, it } from 'vitest';
import type { CookedRequest, InboxRequest } from '../../../worker/protocol';
import { applyCooked } from './cookedInbox';
import type { Recipe } from './types';

const now = new Date('2026-11-12T10:00:00Z');
const recipe = (id: string, cooked?: string[]): Recipe => ({ id, name: id, ingredients: [], steps: [], servings: 2, tags: [], cooked, createdAt: '', updatedAt: '' });
const req = (id: string, recipeId: string, date: string, over: Partial<CookedRequest> = {}): CookedRequest => ({ id, type: 'cooked', recipeId, date, itemIds: [], outfitIds: [], source: 'claude', createdAt: '2026-11-11T20:00:00Z', updatedAt: '', ...over });

describe('applyCooked', () => {
  it('adds the day to the recipe and marks the request applied', () => {
    const r = applyCooked([req('q1', 'pesto', '2026-11-11')], [recipe('pesto', ['2026-11-01'])], now);
    expect(r.recipes).toHaveLength(1);
    expect(r.recipes[0].cooked).toEqual(['2026-11-01', '2026-11-11']);
    expect(r.requests[0].appliedAt).toBe(now.toISOString());
  });
  it('changes nothing for a day already there, or a request already applied', () => {
    const r = applyCooked([req('q1', 'pesto', '2026-11-01'), req('q2', 'pesto', '2026-11-05', { appliedAt: '2026-11-11T21:00:00Z' })], [recipe('pesto', ['2026-11-01'])], now);
    expect(r.recipes).toEqual([]);
    expect(r.requests.map((x) => x.id)).toEqual(['q1']);
  });
  it('notes a recipe that is gone, ignores other requests and drops old applied ones', () => {
    const wear = { id: 'w', type: 'wear', date: '2026-11-11', itemIds: ['x'], outfitIds: [], source: 'claude', createdAt: '', updatedAt: '' } as InboxRequest;
    const old = req('q3', 'pesto', '2026-09-01', { appliedAt: '2026-09-02T00:00:00Z' });
    const r = applyCooked([wear, req('q1', 'gone', '2026-11-11'), old], [recipe('pesto')], now);
    expect(r.requests).toHaveLength(1);
    expect((r.requests[0] as CookedRequest).error).toMatch(/gone/);
    expect(r.expired).toEqual(['q3']);
  });
});
