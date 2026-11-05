import { describe, expect, it } from 'vitest';
import type { TripitPlan } from '../../../worker/tripitTypes';
import { groupPlans, newTrips, plansOfTrip } from './tripit';
import type { Trip } from './types';

const plan = (id: string, start: string, end = start, extra: Partial<TripitPlan> = {}): TripitPlan => ({
  id,
  kind: 'other',
  title: id,
  start,
  end,
  allDay: false,
  ...extra,
});

const trip = (over: Partial<Trip>): Trip => ({
  id: 't',
  name: 'Mine',
  startDate: '2026-01-01',
  endDate: '2026-01-02',
  outfitPlan: {},
  itemIds: [],
  extras: [],
  packed: [],
  createdAt: '',
  updatedAt: '',
  ...over,
});

const NOW = '2026-11-04T10:00:00.000Z';

describe('groupPlans', () => {
  it('puts plans that touch or overlap in one trip, and far apart ones in another', () => {
    const groups = groupPlans([
      plan('flight-back', '2026-11-08'),
      plan('flight-out', '2026-11-05'),
      plan('hotel', '2026-11-05', '2026-11-07', { kind: 'lodging' }),
      plan('later', '2026-12-20'),
    ]);
    expect(groups.map((g) => [g.ref, g.start, g.end, g.plans.length])).toEqual([
      ['flight-out', '2026-11-05', '2026-11-08', 3],
      ['later', '2026-12-20', '2026-12-20', 1],
    ]);
  });

  it('takes the most common trip name', () => {
    const [g] = groupPlans([plan('a', '2026-11-05', '2026-11-05', { tripName: 'Lisbon' }), plan('b', '2026-11-06', '2026-11-06', { tripName: 'Lisbon' }), plan('c', '2026-11-06', '2026-11-06', { tripName: 'Other' })]);
    expect(g.tripName).toBe('Lisbon');
  });
});

describe('newTrips', () => {
  const plans = [plan('tripit-a', '2026-11-05', '2026-11-05', { tripName: 'Lisbon weekend' }), plan('tripit-h', '2026-11-05', '2026-11-07', { kind: 'lodging', location: 'Hotel Avenida, Lisbon' })];

  it('makes one trip per group, named and dated', () => {
    const [t, ...rest] = newTrips(plans, [], [], NOW);
    expect(rest).toEqual([]);
    expect(t).toMatchObject({ id: 'trip-tripit-a', name: 'Lisbon weekend', destination: 'Hotel Avenida, Lisbon', startDate: '2026-11-05', endDate: '2026-11-07', tripitRef: 'tripit-a', packed: [] });
  });

  it('falls back to a month name when TripIt gives none', () => {
    expect(newTrips([plan('x', '2026-03-02')], [], [], NOW)[0].name).toBe('Trip · March 2026');
  });

  it('never touches or repeats a trip that already exists', () => {
    expect(newTrips(plans, [trip({ tripitRef: 'tripit-a', startDate: '2026-11-05', endDate: '2026-11-07' })], [], NOW)).toEqual([]);
    // Even when the group's earliest plan changed, any plan in it still links it.
    expect(newTrips(plans, [trip({ tripitRef: 'tripit-h', startDate: '2030-01-01', endDate: '2030-01-02' })], [], NOW)).toEqual([]);
  });

  it('does not double a trip you made by hand', () => {
    expect(newTrips(plans, [trip({ startDate: '2026-11-06', endDate: '2026-11-09' })], [], NOW)).toEqual([]);
  });

  it('does not bring back a trip you deleted', () => {
    expect(newTrips(plans, [], ['tripit-a'], NOW)).toEqual([]);
  });
});

describe('plansOfTrip', () => {
  it('lists the plans on the trip days in order', () => {
    const plans = [plan('after', '2026-11-20'), plan('b', '2026-11-06', '2026-11-06', { startTime: '10:00' }), plan('a', '2026-11-06', '2026-11-06', { startTime: '08:00' }), plan('stay', '2026-11-04', '2026-11-08')];
    expect(plansOfTrip(plans, { startDate: '2026-11-05', endDate: '2026-11-07' }).map((p) => p.id)).toEqual(['stay', 'a', 'b']);
  });
});
