import { describe, expect, it } from 'vitest';
import type { Outfit, Plan } from '../clothes/types';
import { dayChanges, legacyPlans, tripOutfitsByDay, tripsWithLegacyOutfits } from './tripPlans';
import type { Trip } from './types';

const stamp = '2026-01-01T00:00:00Z';
const outfit = (id: string, wears: string[] = []): Outfit => ({ id, itemIds: [], wears, createdAt: stamp, updatedAt: stamp });
const plan = (outfitId: string, date: string, createdAt = stamp): Plan => ({ id: `${outfitId}_${date}`, date, outfitId, createdAt, updatedAt: createdAt });
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
const ids = (m: Map<string, Outfit[]>, date: string) => (m.get(date) ?? []).map((o) => o.id);

describe('tripOutfitsByDay', () => {
  it('is what the calendar has for the trip days: plans in order, then worn outfits', () => {
    const outfits = [outfit('a'), outfit('b'), outfit('c', ['2026-11-02'])];
    const plans = [plan('b', '2026-11-02', '2026-01-02T00:00:00Z'), plan('a', '2026-11-02', '2026-01-01T00:00:00Z'), plan('a', '2026-12-01')];
    const m = tripOutfitsByDay(trip(), plans, outfits);
    expect(ids(m, '2026-11-02')).toEqual(['a', 'b', 'c']);
    // Plans outside the trip do not count, and days with nothing are left out.
    expect([...m.keys()]).toEqual(['2026-11-02']);
  });

  it('shows an outfit once when it is both planned and worn that day', () => {
    expect(ids(tripOutfitsByDay(trip(), [plan('a', '2026-11-01')], [outfit('a', ['2026-11-01'])]), '2026-11-01')).toEqual(['a']);
  });

  it('skips plans for outfits that no longer exist', () => {
    expect(tripOutfitsByDay(trip(), [plan('gone', '2026-11-01')], []).size).toBe(0);
  });

  it('still shows legacy entries kept on the trip until they are migrated', () => {
    const m = tripOutfitsByDay(trip({ outfitPlan: { '2026-11-01': ['a'], '2026-12-01': ['b'] } }), [plan('c', '2026-11-01')], [outfit('a'), outfit('b'), outfit('c')]);
    expect(ids(m, '2026-11-01')).toEqual(['c', 'a']);
    expect(m.has('2026-12-01')).toBe(false);
  });
});

describe('legacy outfits', () => {
  const old = trip({ outfitPlan: { '2026-11-01': ['a', 'b'], '2026-11-02': ['a'] } });

  it('become plans with the calendar\'s own ids, skipping ones already there', () => {
    const made = legacyPlans([old], [plan('a', '2026-11-01')]);
    expect(made.map((p) => p.id)).toEqual(['b_2026-11-01', 'a_2026-11-02']);
    expect(made[0]).toMatchObject({ date: '2026-11-01', outfitId: 'b' });
  });

  it('are found only on trips that still have some', () => {
    expect(tripsWithLegacyOutfits([old, trip({ id: 'x' }), trip({ id: 'y', outfitPlan: {} })]).map((t) => t.id)).toEqual(['t1']);
  });
});

describe('dayChanges', () => {
  const outfits = [outfit('a'), outfit('b'), outfit('w', ['2026-11-02'])];

  it('adds plans for new choices and removes plans that were unchecked', () => {
    const plans = [plan('a', '2026-11-02')];
    const change = dayChanges(trip(), plans, outfits, '2026-11-02', ['b']);
    expect(change.add.map((p) => p.id)).toEqual(['b_2026-11-02']);
    expect(change.remove).toEqual(['a_2026-11-02']);
  });

  it('leaves an outfit already worn that day alone', () => {
    const change = dayChanges(trip(), [], outfits, '2026-11-02', ['w', 'a']);
    expect(change.add.map((p) => p.outfitId)).toEqual(['a']);
    expect(change.remove).toEqual([]);
  });

  it('turns a kept legacy entry into a plan and drops the trip\'s copy of that day', () => {
    const t = trip({ outfitPlan: { '2026-11-01': ['a'], '2026-11-03': ['b'] } });
    const change = dayChanges(t, [], outfits, '2026-11-01', ['a']);
    expect(change.add.map((p) => p.id)).toEqual(['a_2026-11-01']);
    expect(change.trip.outfitPlan).toEqual({ '2026-11-03': ['b'] });
  });

  it('does not change the trip when it has no entry for the day', () => {
    const t = trip();
    expect(dayChanges(t, [], outfits, '2026-11-01', ['a']).trip).toBe(t);
  });
});
