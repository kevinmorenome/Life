import { describe, expect, it } from 'vitest';
import type { TripitPlan } from '../../../worker/tripitTypes';
import type { Checkin } from '../checkins/types';
import { itineraryCheckins, sameName } from './itineraryCheckins';

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
    expect(r.matched.get('p')?.id).toBe('s');
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
});
