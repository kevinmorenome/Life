import { describe, expect, it } from 'vitest';
import type { TripitPlan } from '../../../worker/tripitTypes';
import type { Checkin } from '../checkins/types';
import { itineraryCheckins, matchKey, sameName } from './itineraryCheckins';
import { isUpcoming } from './placeRows';

const plan = (o: Partial<TripitPlan>): TripitPlan => ({ id: 'p', kind: 'meal', title: 'Curry Bowl', start: '2022-09-28', end: '2022-09-28', ...o }) as TripitPlan;
const ci = (o: Partial<Checkin>): Checkin => ({ id: 's', venue: 'Curry Bowl', date: '2022-09-28', time: '20:00', at: 1, source: 'swarm', createdAt: '', updatedAt: '', ...o });

describe('sameName', () => {
  it('ignores case, accents and punctuation, and lets one name sit inside the other', () => {
    expect(sameName('Café Nero', 'cafe nero')).toBe(true);
    expect(sameName('Hotel Sol', 'Hotel Sol Tulum')).toBe(true);
    expect(sameName('Curry Bowl', 'Burger King')).toBe(false);
    expect(sameName('Bar', 'Barcelona')).toBe(false);
    expect(sameName('', 'x')).toBe(false);
  });
});

describe('itineraryCheckins', () => {
  it('folds a Swarm check-in into the plan of the same name, so it is listed once', () => {
    const r = itineraryCheckins([plan({})], [ci({})], '2022-09-25', '2022-09-30');
    expect(r.matched.get(matchKey(plan({}), '2022-09-28'))?.id).toBe('s');
    expect(r.extra.size).toBe(0);
  });
  it('lists the others on their own day, oldest first', () => {
    const r = itineraryCheckins([plan({})], [ci({ id: 'b', venue: 'Museum', at: 5 }), ci({ id: 'a', venue: 'Park', at: 2 }), ci({ id: 'c', venue: 'Zoo', date: '2022-09-29', at: 9 })], '2022-09-25', '2022-09-30');
    expect(r.extra.get('2022-09-28')?.map((c) => c.id)).toEqual(['a', 'b']);
    expect(r.extra.get('2022-09-29')?.map((c) => c.id)).toEqual(['c']);
  });
  it('leaves out check-ins made from plans, other days and removed plans', () => {
    const r = itineraryCheckins([plan({ removed: true })], [ci({ source: 'plan' }), ci({ id: 'out', date: '2022-10-05' }), ci({ id: 'in' })], '2022-09-25', '2022-09-30');
    expect([...r.extra.values()].flat().map((c) => c.id)).toEqual(['in']);
    expect(r.matched.size).toBe(0);
  });
  it('folds one check-in per plan and day, and lists a second one at the same place', () => {
    const stay = plan({ id: 'stay', title: 'Hotel Sol', start: '2022-09-28', end: '2022-09-29' });
    const r = itineraryCheckins([stay], [ci({ id: 'a', venue: 'Hotel Sol', at: 1 }), ci({ id: 'b', venue: 'Hotel Sol', at: 2 }), ci({ id: 'c', venue: 'Hotel Sol', date: '2022-09-29', at: 3 })], '2022-09-25', '2022-09-30');
    expect([r.matched.get(matchKey(stay, '2022-09-28'))?.id, r.matched.get(matchKey(stay, '2022-09-29'))?.id]).toEqual(['a', 'c']);
    expect(r.extra.get('2022-09-28')?.map((c) => c.id)).toEqual(['b']);
  });
});

describe('isUpcoming', () => {
  const p = { start: '2022-09-28', startTime: '20:00' };
  it('is true for a later day and for later today, false once it has happened', () => {
    expect(isUpcoming(p, '2022-09-28', undefined, '2022-09-27', '12:00')).toBe(true);
    expect(isUpcoming(p, '2022-09-28', undefined, '2022-09-28', '19:59')).toBe(true);
    expect(isUpcoming(p, '2022-09-28', undefined, '2022-09-28', '20:00')).toBe(false);
    expect(isUpcoming(p, '2022-09-28', undefined, '2022-09-29', '08:00')).toBe(false);
  });
  it('is false when you checked in at it, and a plan with no time counts as all day today', () => {
    expect(isUpcoming(p, '2022-09-28', { id: 'x' }, '2022-09-27', '12:00')).toBe(false);
    expect(isUpcoming({ start: '2022-09-28' }, '2022-09-28', undefined, '2022-09-28', '07:00')).toBe(false);
  });
});
