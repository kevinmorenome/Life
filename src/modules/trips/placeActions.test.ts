import { describe, expect, it } from 'vitest';
import type { TripitPlan } from '../../../worker/tripitTypes';
import type { Checkin } from '../checkins/types';
import { candidatesFor, mergeChanges, type PlaceRef } from './placeActions';

const plan = (id: string): TripitPlan => ({ id, kind: 'activity', title: id, start: '2022-10-01', end: '2022-10-01' }) as TripitPlan;
const ci = (id: string, o: Partial<Checkin> = {}): Checkin => ({ id, venue: id, date: '2022-10-01', time: '19:50', at: 100, source: 'swarm', createdAt: '', updatedAt: '', ...o });
const day = '2022-10-01';
const p = (id: string, here?: Checkin): PlaceRef => ({ kind: 'plan', day, plan: plan(id), here });
const c = (id: string, o?: Partial<Checkin>): PlaceRef => ({ kind: 'checkin', day, checkin: ci(id, o) });

describe('candidatesFor', () => {
  const rows = [p('beach'), p('hotel', ci('h')), c('a'), c('b')];
  it('offers a plan the lone check-ins, a check-in the open plans and the other check-ins, a merged row nothing', () => {
    expect(candidatesFor(rows[0], rows).map((r) => (r.kind === 'checkin' ? r.checkin.id : r.plan.id))).toEqual(['a', 'b']);
    expect(candidatesFor(rows[2], rows).map((r) => (r.kind === 'checkin' ? r.checkin.id : r.plan.id))).toEqual(['beach', 'b']);
    expect(candidatesFor(rows[1], rows)).toEqual([]);
  });
});

describe('mergeChanges', () => {
  it('links a check-in to a plan, either way round', () => {
    const r = mergeChanges(p('beach'), c('a'), 'now')!;
    expect([r.save[0].planRef, r.remove]).toEqual(['beach', []]);
    expect(mergeChanges(c('a'), p('beach'), 'now')!.save[0].planRef).toBe('beach');
  });
  it('merges two check-ins into the one that keeps most, dropping the other', () => {
    const r = mergeChanges(c('a', { time: '' }), c('b', { category: 'Beach' }), 'now')!;
    expect(r.save.map((x) => x.id)).toEqual(['b']);
    expect(r.remove).toEqual(['a']);
  });
  it('does nothing for a plan that already has a check-in', () => {
    expect(mergeChanges(p('hotel', ci('h')), c('a'), 'now')).toBeNull();
  });
});
