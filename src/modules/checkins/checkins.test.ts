import { describe, expect, it } from 'vitest';
import { byDate, dayLabel, place } from './checkins';
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
