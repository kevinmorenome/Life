import type { TripitPlan } from '../../../worker/tripitTypes';
import type { Checkin } from '../checkins/types';
import type { Trip } from './types';

const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * A made-up Mexico trip around today, for trying out the trip line, flags and Places in a PR preview: flights with a
 * layover in Amsterdam, a hotel, two Swarm check-ins and plans for today and tomorrow (one of them also checked in
 * with Swarm, so it shows once). Ids are fixed, so adding it twice changes nothing.
 */
export function sampleTrip(today: string, now: string): { trip: Trip; plans: TripitPlan[]; checkins: Checkin[] } {
  const d = (n: number) => addDays(today, n);
  const plan = (id: string, p: Partial<TripitPlan> & Pick<TripitPlan, 'kind' | 'title' | 'start'>): TripitPlan => ({ id: `sample-plan-${id}`, end: p.start, allDay: !p.startTime, tripRef: 'sample-trip', ...p });
  const trip: Trip = { id: 'sample-trip', name: 'Sample · Mexico', destination: 'Tulum, Mexico', country: 'MX', startDate: d(-6), endDate: d(4), itemIds: [], extras: [], packed: [], createdAt: now, updatedAt: now };
  const plans: TripitPlan[] = [
    plan('f1', { kind: 'flight', title: 'ZAG → AMS (KL1)', start: d(-6), startTime: '06:30', end: d(-6), endTime: '08:45', location: 'Zagreb → Amsterdam', stops: [{ country: 'HR', date: d(-6) }, { country: 'NL', date: d(-6) }] }),
    plan('f2', { kind: 'flight', title: 'AMS → CUN (KL2)', start: d(-6), startTime: '11:00', end: d(-6), endTime: '15:30', location: 'Amsterdam → Cancún', stops: [{ country: 'NL', date: d(-6) }, { country: 'MX', date: d(-6) }] }),
    plan('h', { kind: 'lodging', title: 'Hotel Sol', start: d(-5), end: d(3), location: 'Tulum, Mexico', stops: [{ country: 'MX', date: d(-5) }, { country: 'MX', date: d(3) }] }),
    plan('a1', { kind: 'activity', title: 'Cenote tour', start: d(-3), startTime: '09:00', location: 'Tulum, Mexico', stops: [{ country: 'MX', date: d(-3) }] }),
    plan('a2', { kind: 'meal', title: 'Dinner at Hartwood', start: d(0), startTime: '20:00', location: 'Tulum, Mexico', stops: [{ country: 'MX', date: d(0) }] }),
    plan('a3', { kind: 'activity', title: 'Chichén Itzá', start: d(1), startTime: '08:00', location: 'Yucatán, Mexico', stops: [{ country: 'MX', date: d(1) }] }),
  ];
  const swarm = (id: string, venue: string, category: string, city: string, date: string, time: string): Checkin => ({
    id: `sample-swarm-${id}`, venue, category, city, country: 'Mexico', date, time, at: Math.floor(Date.parse(`${date}T${time}:00Z`) / 1000), source: 'swarm', createdAt: now, updatedAt: now,
  });
  return {
    trip,
    plans,
    checkins: [
      swarm('1', 'Playa Paraíso', 'Beach', 'Tulum', d(-4), '11:20'),
      // Covers the cenote plan, so that one is not made into a second check-in.
      swarm('2', 'Gran Cenote', 'Nature Preserve', 'Tulum', d(-3), '09:40'),
    ],
  };
}
