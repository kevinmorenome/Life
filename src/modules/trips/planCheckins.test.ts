import { describe, expect, it } from 'vitest';
import type { Checkin } from '../checkins/types';
import { planCheckinChanges, plannedOnDay } from './planCheckins';

const flight = {
  id: 'tripit-t1-a-1',
  kind: 'flight' as const,
  title: 'ZAG → AMS (KL1)',
  start: '2026-09-18',
  startTime: '07:00',
  end: '2026-09-18',
  endTime: '09:00',
  location: 'Zagreb → Amsterdam',
  stops: [
    { country: 'HR', date: '2026-09-18' },
    { country: 'NL', date: '2026-09-18' },
  ],
};
const hotel = { id: 'tripit-t1-h', kind: 'lodging' as const, title: 'Hotel Sol', start: '2026-09-19', end: '2026-09-25', location: 'Tulum, Mexico', stops: [{ country: 'MX', date: '2026-09-19' }] };
const TODAY = '2026-10-01';
const swarm = (o: Partial<Checkin>): Checkin => ({ id: 's', venue: 'x', date: '2026-09-19', time: '10:00', at: 1, source: 'swarm', createdAt: '', updatedAt: '', ...o });

describe('planCheckinChanges', () => {
  it('makes two airport check-ins for a flight and one for a stay', () => {
    const { add } = planCheckinChanges([flight, hotel], [], TODAY);
    expect(add.map((c) => [c.id, c.country, c.date, c.category])).toEqual([
      ['plan-tripit-t1-a-1-dep', 'Croatia', '2026-09-18', 'Airport'],
      ['plan-tripit-t1-a-1-arr', 'Netherlands', '2026-09-18', 'Airport'],
      ['plan-tripit-t1-h', 'Mexico', '2026-09-19', 'Hotel'],
    ]);
    expect(add[0].at).toBeLessThan(add[1].at);
    expect(add.every((c) => c.source === 'plan')).toBe(true);
  });
  it('is idempotent: nothing to do once they exist', () => {
    const first = planCheckinChanges([flight, hotel], [], TODAY).add;
    expect(planCheckinChanges([flight, hotel], first, TODAY)).toEqual({ add: [], remove: [] });
  });
  it('lets Swarm win for the same country on the same day', () => {
    const { add } = planCheckinChanges([hotel], [swarm({ country: 'Mexico', city: 'Tulum' })], TODAY);
    expect(add).toEqual([]);
    expect(planCheckinChanges([hotel], [swarm({ country: 'Mexico', city: 'Cancún' })], TODAY).add).toHaveLength(1);
  });
  it('deletes the check-ins of a removed plan, or ones Swarm now covers', () => {
    const made = planCheckinChanges([hotel], [], TODAY).add;
    expect(planCheckinChanges([{ ...hotel, removed: true }], made, TODAY).remove).toEqual(['plan-tripit-t1-h']);
    expect(planCheckinChanges([hotel], [...made, swarm({ country: 'Mexico' })], TODAY).remove).toEqual(['plan-tripit-t1-h']);
  });
  it('waits until the day is over: plans of today and later make no check-in', () => {
    expect(planCheckinChanges([hotel], [], '2026-09-19').add).toEqual([]);
    expect(planCheckinChanges([hotel], [], '2026-09-18').add).toEqual([]);
    expect(planCheckinChanges([hotel], [], '2026-09-20').add).toHaveLength(1);
  });
});

describe('plannedOnDay', () => {
  it('lists the plans of today and later, not days that are over', () => {
    expect(plannedOnDay([hotel], [], '2026-09-19', '2026-09-19').map((d) => d.venue)).toEqual(['Hotel Sol']);
    expect(plannedOnDay([hotel], [], '2026-09-19', '2026-09-20')).toEqual([]);
  });
  it('leaves out what Swarm already has, so nothing shows twice', () => {
    expect(plannedOnDay([hotel], [swarm({ country: 'Mexico' })], '2026-09-19', '2026-09-19')).toEqual([]);
  });
});
