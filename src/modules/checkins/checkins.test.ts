import { describe, expect, it } from 'vitest';
import { isDue, REFRESH_AFTER_MS } from './swarmClient';
import { byDate, dayLabel, moveCheckin, mergeCheckins, moveCheckins, place } from './checkins';
import type { Checkin } from './types';

const at = (id: string, date: string, time: string, secs: number, extra: Partial<Checkin> = {}): Checkin => ({
  id,
  venue: id,
  date,
  time,
  at: secs,
  source: 'swarm',
  createdAt: '',
  updatedAt: '',
  ...extra,
});

describe('byDate', () => {
  it('groups by local date with each day oldest first', () => {
    const days = byDate([at('b', '2026-10-01', '18:00', 200), at('a', '2026-10-01', '09:00', 100), at('c', '2026-10-02', '10:00', 300)]);
    expect([...days.keys()]).toEqual(['2026-10-01', '2026-10-02']);
    expect(days.get('2026-10-01')?.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('dayLabel', () => {
  it('names a single venue and counts several', () => {
    expect(dayLabel([at('Cafe', 'd', 't', 1)])).toBe('Cafe');
    expect(dayLabel([at('a', 'd', 't', 1), at('b', 'd', 't', 2)])).toBe('2 places');
  });
});

describe('place', () => {
  it('joins what is known', () => {
    expect(place(at('x', 'd', 't', 1, { category: 'Café', city: 'London' }))).toBe('Café · London');
    expect(place(at('x', 'd', 't', 1, { city: 'London' }))).toBe('London');
    expect(place(at('x', 'd', 't', 1))).toBe('');
  });
});

describe('isDue', () => {
  it('is due when never fetched or when the last fetch is old enough', () => {
    expect(isDue(null, 1_000_000)).toBe(true);
    expect(isDue(1_000_000, 1_000_000 + REFRESH_AFTER_MS)).toBe(true);
  });
  it('is not due right after a fetch', () => {
    expect(isDue(1_000_000, 1_000_000 + REFRESH_AFTER_MS - 1)).toBe(false);
  });
});

describe('moveCheckin', () => {
  const c = at('x', '2026-10-01', '09:30', 1000, { venue: 'Cafe', city: 'London' });
  it('moves the day and time and shifts `at` by the same amount', () => {
    const m = moveCheckin(c, '2026-10-03', '10:00', 'now');
    expect([m.date, m.time, m.at - c.at, m.updatedAt]).toEqual(['2026-10-03', '10:00', 2 * 86400 + 30 * 60, 'now']);
    expect([m.venue, m.city, m.source]).toEqual(['Cafe', 'London', 'swarm']);
  });
  it('leaves the record alone when nothing changed or the input is not valid', () => {
    expect(moveCheckin(c, '2026-10-01', '09:30', 'now')).toBe(c);
    expect(moveCheckin(c, '', '09:30', 'now')).toBe(c);
    expect(moveCheckin(c, '2026-10-02', '9am', 'now')).toBe(c);
  });
  it('can leave the time out, and put one back', () => {
    const none = moveCheckin(c, '2026-10-01', '', 'now');
    expect([none.time, none.at - c.at]).toEqual(['', 150 * 60]);
    const back = moveCheckin(none, '2026-10-01', '09:30', 'now');
    expect([back.time, back.at]).toEqual([c.time, c.at]);
  });
});

describe('moveCheckins', () => {
  const list = [at('a', '2026-10-01', '09:00', 100), at('b', '2026-10-01', '18:30', 200), at('c', '2026-10-01', '10:00', 300), at('p', '2026-10-01', '11:00', 400, { source: 'plan' })];
  it('moves the ticked Swarm check-ins to one day and keeps each time', () => {
    const moved = moveCheckins(list, new Set(['a', 'b', 'p']), '2026-10-05', 'now');
    expect(moved.map((m) => [m.id, m.date, m.time])).toEqual([['a', '2026-10-05', '09:00'], ['b', '2026-10-05', '18:30']]);
  });
  it('skips the ones already on that day', () => {
    expect(moveCheckins(list, new Set(['a']), '2026-10-01', 'now')).toEqual([]);
  });
});

describe('mergeCheckins', () => {
  const swarm = at('s', '2026-09-28', '', 12 * 3600, { venue: 'Curry Bowl', category: 'Sri Lankan Restaurant', city: 'Zagreb' });
  const plan = at('p', '2026-09-28', '20:00', 20 * 3600, { venue: 'Curry Bowl', category: 'Restaurant', city: 'Zagreb', country: 'Croatia', source: 'plan' });
  it('keeps the Swarm one and fills what it lacks from the plan one', () => {
    const r = mergeCheckins(plan, swarm, 'now')!;
    expect(r.drop.id).toBe('p');
    expect([r.keep.id, r.keep.time, r.keep.category, r.keep.country, r.keep.at, r.keep.updatedAt]).toEqual(['s', '20:00', 'Sri Lankan Restaurant', 'Croatia', 20 * 3600, 'now']);
  });
  it('does not touch a field the kept one already has', () => {
    const r = mergeCheckins(swarm, { ...plan, source: 'swarm', time: '' }, 'now')!;
    expect(r.keep.id).toBe('s');
    expect(r.keep.category).toBe('Sri Lankan Restaurant');
    expect(r.keep.time).toBe('');
  });
  it('refuses two check-ins on different days or the same one twice', () => {
    expect(mergeCheckins(swarm, { ...plan, date: '2026-09-29' }, 'now')).toBeNull();
    expect(mergeCheckins(swarm, swarm, 'now')).toBeNull();
  });
});
