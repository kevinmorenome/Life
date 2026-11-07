import { describe, expect, it } from 'vitest';
import type { ItemEditRequest, OutfitEditRequest, PhotoRequest, TagRequest, WearRequest } from '../../../worker/protocol';
import { applyInbox, preparePhotos, withTags } from './inbox';
import type { ClothingItem, Outfit } from './types';

const NOW = new Date('2026-10-25T20:00:00Z');

function item(id: string, wears: string[] = []): ClothingItem {
  return { id, name: id, category: 'tops', seasons: [], status: 'active', wears, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
}
function outfit(id: string, itemIds: string[], wears: string[] = []): Outfit {
  return { id, itemIds, wears, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
}
function request(patch: Partial<WearRequest> = {}): WearRequest {
  return {
    id: 'r1',
    type: 'wear',
    date: '2026-10-25',
    itemIds: [],
    outfitIds: [],
    source: 'claude',
    createdAt: '2026-10-25T10:00:00Z',
    updatedAt: '2026-10-25T10:00:00Z',
    ...patch,
  };
}

describe('applyInbox', () => {
  it('logs items and marks the request applied', () => {
    const r = applyInbox([request({ itemIds: ['a'] })], [item('a'), item('b')], [], NOW);
    expect(r.items.map((i) => [i.id, i.wears])).toEqual([['a', ['2026-10-25']]]);
    expect(r.requests[0]).toMatchObject({ id: 'r1', appliedAt: NOW.toISOString() });
    expect(r.requests[0].error).toBeUndefined();
  });

  it('logging an outfit also logs its pieces, without double-logging a piece listed too', () => {
    const r = applyInbox(
      [request({ outfitIds: ['o'], itemIds: ['a', 'c'] })],
      [item('a'), item('b'), item('c')],
      [outfit('o', ['a', 'b'])],
      NOW,
    );
    expect(r.outfits.map((o) => o.wears)).toEqual([['2026-10-25']]);
    expect(r.items.map((i) => i.id).sort()).toEqual(['a', 'b', 'c']);
    expect(r.items.every((i) => i.wears.length === 1)).toBe(true);
  });

  it('is idempotent: nothing changes when the date is already logged', () => {
    const r = applyInbox(
      [request({ outfitIds: ['o'], itemIds: ['c'] })],
      [item('a', ['2026-10-25']), item('c', ['2026-10-25'])],
      [outfit('o', ['a'], ['2026-10-25'])],
      NOW,
    );
    expect(r.items).toEqual([]);
    expect(r.outfits).toEqual([]);
    expect(r.requests).toHaveLength(1);
  });

  it('applies what exists and reports ids that were deleted', () => {
    const r = applyInbox([request({ itemIds: ['a', 'gone'], outfitIds: ['ghost'] })], [item('a')], [], NOW);
    expect(r.items.map((i) => i.id)).toEqual(['a']);
    expect(r.requests[0].error).toBe('No longer exist: ghost, gone');
  });

  it('skips requests that are already applied and applies the rest oldest first', () => {
    const done = request({ id: 'done', itemIds: ['a'], appliedAt: '2026-10-24T00:00:00Z' });
    const r = applyInbox([done, request({ id: 'late', itemIds: ['b'], createdAt: '2026-10-25T12:00:00Z' }), request({ id: 'early', itemIds: ['b'] })], [item('a'), item('b')], [], NOW);
    expect(r.requests.map((q) => q.id)).toEqual(['early', 'late']);
    expect(r.items.map((i) => i.id)).toEqual(['b']);
  });

  it('prunes applied requests after two weeks', () => {
    const old = request({ id: 'old', appliedAt: '2026-10-01T00:00:00Z' });
    const recent = request({ id: 'recent', appliedAt: '2026-10-20T00:00:00Z' });
    expect(applyInbox([old, recent], [], [], NOW).expired).toEqual(['old']);
  });
});

describe('tag requests', () => {
  const tagReq = (patch: Partial<TagRequest> = {}): TagRequest => ({
    id: 't1',
    type: 'tags',
    tags: ['cozy'],
    itemIds: [],
    outfitIds: [],
    source: 'claude',
    createdAt: '2026-10-25T10:00:00Z',
    updatedAt: '2026-10-25T10:00:00Z',
    ...patch,
  });

  it('adds tags to items and outfits, keeping the ones already there', () => {
    const a = { ...item('a'), tags: ['work'] };
    const r = applyInbox([tagReq({ itemIds: ['a'], outfitIds: ['o'], tags: ['cozy', 'pajamas'] })], [a], [outfit('o', ['a'])], NOW);
    expect(r.items[0].tags).toEqual(['work', 'cozy', 'pajamas']);
    expect(r.outfits[0].tags).toEqual(['cozy', 'pajamas']);
    expect(r.requests[0].appliedAt).toBe(NOW.toISOString());
  });

  it('is idempotent and ignores case when comparing tags', () => {
    const a = { ...item('a'), tags: ['Cozy'] };
    const r = applyInbox([tagReq({ itemIds: ['a'], tags: ['cozy'] })], [a], [], NOW);
    expect(r.items).toEqual([]);
    expect(r.requests).toHaveLength(1);
  });

  it('reports ids that no longer exist', () => {
    const r = applyInbox([tagReq({ itemIds: ['gone'] })], [], [], NOW);
    expect(r.requests[0].error).toBe('No longer exist: gone');
  });

  it('applies wears and tags requests together', () => {
    const r = applyInbox([request({ itemIds: ['a'] }), tagReq({ itemIds: ['a'], createdAt: '2026-10-25T11:00:00Z' })], [item('a')], [], NOW);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].wears).toEqual(['2026-10-25']);
    expect(r.items[0].tags).toEqual(['cozy']);
  });
});

describe('withTags', () => {
  it('returns the same record when nothing is new, and refreshes updatedAt when something is', () => {
    const rec = { tags: ['a'], updatedAt: 'x' };
    expect(withTags(rec, ['A'])).toBe(rec);
    const next = withTags(rec, ['b', 'B']);
    expect(next.tags).toEqual(['a', 'b']);
    expect(next.updatedAt).not.toBe('x');
  });
});

describe('applyInbox outfit edits', () => {
  const edit = (patch: Partial<OutfitEditRequest>): OutfitEditRequest => ({
    id: 'e1',
    type: 'outfit-edit',
    outfitIds: ['o'],
    itemIds: [],
    removeItemIds: [],
    source: 'claude',
    createdAt: '2026-10-25T10:00:00Z',
    updatedAt: '2026-10-25T10:00:00Z',
    ...patch,
  });
  const items = [item('a'), item('b'), item('c')];

  it('renames and swaps pieces, keeping wears', () => {
    const r = applyInbox([edit({ name: 'Smart', itemIds: ['c'], removeItemIds: ['a'] })], items, [outfit('o', ['a', 'b'], ['2026-10-01'])], NOW);
    expect(r.outfits).toMatchObject([{ id: 'o', name: 'Smart', itemIds: ['b', 'c'], wears: ['2026-10-01'] }]);
    expect(r.requests[0].appliedAt).toBe(NOW.toISOString());
  });

  it('ignores edits that would empty the outfit, and reports missing ids', () => {
    const r = applyInbox([edit({ removeItemIds: ['a', 'b'], itemIds: ['ghost'] })], items, [outfit('o', ['a', 'b'])], NOW);
    expect(r.outfits).toEqual([]);
    expect(r.requests[0].error).toContain('ghost');
  });

  it('is a no-op when nothing changes', () => {
    const r = applyInbox([edit({ itemIds: ['a'] })], items, [outfit('o', ['a', 'b'])], NOW);
    expect(r.outfits).toEqual([]);
  });
});

describe('applyInbox item edits', () => {
  const edit = (changes: ItemEditRequest['changes'], id = 'a'): ItemEditRequest => ({
    id: 'i1',
    type: 'item-edit',
    itemIds: [id],
    outfitIds: [],
    changes,
    source: 'claude',
    createdAt: '2026-10-25T10:00:00Z',
    updatedAt: '2026-10-25T10:00:00Z',
  });
  const base = { ...item('a', ['2026-10-01']), brand: 'Zara', size: 'M', tags: ['x'] };

  it('sets and clears fields, mirrors colours, keeps wears and tags', () => {
    const r = applyInbox([edit({ name: 'Navy tee', brand: null, colors: ['Navy', 'White'], status: 'storage' })], [base], [], NOW);
    expect(r.items[0]).toMatchObject({ name: 'Navy tee', colors: ['Navy', 'White'], color: 'Navy, White', status: 'storage', size: 'M', wears: ['2026-10-01'], tags: ['x'] });
    expect(r.items[0]).not.toHaveProperty('brand');
  });

  it('is a no-op when nothing differs, and reports a missing item', () => {
    expect(applyInbox([edit({ brand: 'Zara', size: 'M' })], [base], [], NOW).items).toEqual([]);
    expect(applyInbox([edit({ name: 'x' }, 'ghost')], [base], [], NOW).requests[0].error).toContain('ghost');
  });
});

describe('photo requests', () => {
  const photoRequest = (patch: Partial<PhotoRequest> = {}): PhotoRequest => ({
    id: 'p1',
    type: 'photo',
    itemIds: ['a'],
    outfitIds: [],
    photo: 'data:image/jpeg;base64,AAAA',
    source: 'claude',
    createdAt: '2026-10-25T10:00:00Z',
    updatedAt: '2026-10-25T10:00:00Z',
    ...patch,
  });

  it('sets the photo on the existing item without touching its wears, and drops the image from the request', () => {
    const r = applyInbox([photoRequest()], [{ ...item('a', ['2026-10-01']), tags: ['x'] }, item('b')], [], NOW);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ id: 'a', photo: 'data:image/jpeg;base64,AAAA', wears: ['2026-10-01'], tags: ['x'], updatedAt: NOW.toISOString() });
    expect(r.requests[0]).toMatchObject({ id: 'p1', appliedAt: NOW.toISOString() });
    expect(r.requests[0]).not.toHaveProperty('photo', expect.any(String));
  });

  it('reports a missing item and changes nothing', () => {
    const r = applyInbox([photoRequest({ itemIds: ['gone'] })], [item('a')], [], NOW);
    expect(r.items).toEqual([]);
    expect(r.requests[0].error).toMatch(/gone/);
  });
});

describe('preparePhotos', () => {
  const photo = (patch: Partial<PhotoRequest> = {}): PhotoRequest => ({
    id: 'p', type: 'photo', itemIds: ['a'], outfitIds: [], photo: 'big', source: 'claude', createdAt: '2026-10-25T10:00:00Z', updatedAt: '2026-10-25T10:00:00Z', ...patch,
  });
  it('converts queued photos, keeps the original when conversion fails, and skips applied ones and other requests', async () => {
    const wear = request({ id: 'w' });
    const out = await preparePhotos(
      [photo({ id: 'ok' }), photo({ id: 'bad', photo: 'broken' }), photo({ id: 'done', appliedAt: '2026-10-25T11:00:00Z', photo: undefined }), wear],
      async (url) => {
        if (url === 'broken') throw new Error('nope');
        return `small(${url})`;
      },
    );
    expect(out.map((r) => (r.type === 'photo' ? r.photo : r.type))).toEqual(['small(big)', 'broken', undefined, 'wear']);
  });
});
