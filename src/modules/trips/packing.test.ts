import { describe, expect, it } from 'vitest';
import type { ClothingItem, Outfit, Plan } from '../clothes/types';
import { packingList, togglePacked, tripDays, tripsOnDate, withExtra, withoutExtra } from './packing';
import type { Trip } from './types';

const stamp = '2026-01-01T00:00:00Z';
const item = (id: string, over: Partial<ClothingItem> = {}): ClothingItem => ({
  id,
  name: id,
  category: 'tops',
  seasons: [],
  status: 'active',
  wears: [],
  createdAt: stamp,
  updatedAt: stamp,
  ...over,
});
const outfit = (id: string, itemIds: string[]): Outfit => ({ id, itemIds, wears: [], createdAt: stamp, updatedAt: stamp });
const trip = (over: Partial<Trip> = {}): Trip => ({
  id: 't1',
  name: 'Lisbon',
  startDate: '2026-11-01',
  endDate: '2026-11-03',
  itemIds: [],
  extras: [],
  packed: [],
  createdAt: stamp,
  updatedAt: stamp,
  ...over,
});
const label = (o: Outfit) => o.id;
const plan = (outfitId: string, date: string): Plan => ({ id: `${outfitId}_${date}`, date, outfitId, createdAt: stamp, updatedAt: stamp });

describe('packing', () => {
  it('lists each day of the trip, inclusive, across month ends', () => {
    expect(tripDays(trip())).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(tripDays(trip({ startDate: '2026-10-31', endDate: '2026-11-01' }))).toEqual(['2026-10-31', '2026-11-01']);
    expect(tripDays(trip({ startDate: '2026-11-03', endDate: '2026-11-01' }))).toEqual([]);
  });

  it('finds trips covering a date', () => {
    const trips = [trip(), trip({ id: 't2', startDate: '2026-12-01', endDate: '2026-12-02' })];
    expect(tripsOnDate(trips, '2026-11-03').map((t) => t.id)).toEqual(['t1']);
    expect(tripsOnDate(trips, '2026-11-04')).toEqual([]);
  });

  it('merges outfit pieces and hand-picked items without duplicates', () => {
    const items = [item('shirt'), item('jeans', { category: 'bottoms' }), item('hat', { category: 'accessories' })];
    const outfits = [outfit('a', ['shirt', 'jeans']), outfit('b', ['shirt'])];
    const t = trip({ itemIds: ['hat', 'shirt'] });
    const list = packingList(t, items, outfits, label, [plan('a', '2026-11-01'), plan('b', '2026-11-02')]);
    expect(list.clothes.map((c) => c.item.id)).toEqual(['hat', 'jeans', 'shirt']);
    const shirt = list.clothes.find((c) => c.item.id === 'shirt')!;
    expect(shirt.viaOutfits).toEqual(['a', 'b']);
    expect(shirt.manual).toBe(true);
    expect(list.clothes.find((c) => c.item.id === 'jeans')!.manual).toBe(false);
  });

  it('skips deleted outfits and items', () => {
    const t = trip({ itemIds: ['missing'] });
    const list = packingList(t, [item('shirt')], [outfit('a', ['shirt', 'ghost'])], label, [plan('gone', '2026-11-01'), plan('a', '2026-11-01')]);
    expect(list.clothes.map((c) => c.item.id)).toEqual(['shirt']);
  });

  it('counts packed clothes and extras', () => {
    const t = trip({ itemIds: ['shirt', 'jeans'], extras: [{ id: 'x1', label: 'Passport', group: 'Documents' }], packed: ['shirt', 'x1'] });
    const list = packingList(t, [item('shirt'), item('jeans')], [], label);
    expect(list.total).toBe(3);
    expect(list.packedCount).toBe(2);
  });

  it('toggles packed state', () => {
    const t = togglePacked(trip(), 'shirt');
    expect(t.packed).toEqual(['shirt']);
    expect(togglePacked(t, 'shirt').packed).toEqual([]);
  });

  it('takes the pieces from the calendar\'s plans on the trip days', () => {
    const items = [item('shirt'), item('jeans', { category: 'bottoms' })];
    const outfits = [outfit('a', ['shirt']), outfit('b', ['jeans'])];
    const plans = [plan('a', '2026-11-02'), plan('b', '2026-12-25')];
    const list = packingList(trip(), items, outfits, label, plans);
    // b is planned, but on a day outside the trip.
    expect(list.clothes.map((c) => c.item.id)).toEqual(['shirt']);
    expect(list.clothes[0].viaOutfits).toEqual(['a']);
  });

  it('ignores duplicate extras and forgets packed state when one is removed', () => {
    const x = { id: 'x1', label: 'Passport', group: 'Documents' };
    const t = withExtra(trip(), x);
    expect(withExtra(t, { ...x, id: 'x2', label: 'passport' }).extras).toHaveLength(1);
    const packed = withoutExtra(togglePacked(t, 'x1'), 'x1');
    expect(packed.extras).toEqual([]);
    expect(packed.packed).toEqual([]);
  });
});
