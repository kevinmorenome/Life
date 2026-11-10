import { describe, expect, it } from 'vitest';
import { onThisDay } from './onThisDay';
import type { Checkin } from './types';

const ci = (venue: string, date: string, time = '12:00'): Checkin => ({
  id: `${venue}-${date}-${time}`,
  venue,
  date,
  time,
  at: Date.parse(`${date}T${time}:00Z`) / 1000,
  source: 'swarm',
  createdAt: '',
  updatedAt: '',
});

describe('onThisDay', () => {
  const list = [
    ci('A', '2025-11-10', '18:00'),
    ci('B', '2025-11-10', '09:00'),
    ci('C', '2023-11-10'),
    ci('D', '2026-11-10'),
    ci('E', '2027-11-10'),
    ci('F', '2025-11-11'),
  ];

  it('lists the same day of earlier years, latest year first, each day oldest check-in first', () => {
    const years = onThisDay(list, '2026-11-10');
    expect(years.map((y) => y.year)).toEqual(['2025', '2023']);
    expect(years[0].checkins.map((c) => c.venue)).toEqual(['B', 'A']);
    expect(years[0].date).toBe('2025-11-10');
  });

  it('never includes the day itself or later years', () => {
    expect(onThisDay(list, '2025-11-10').map((y) => y.year)).toEqual(['2023']);
    expect(onThisDay(list, '2023-11-10')).toEqual([]);
  });

  it('matches 29 February only to another 29 February', () => {
    const leap = [ci('X', '2024-02-29'), ci('Y', '2023-02-28')];
    expect(onThisDay(leap, '2028-02-29').map((y) => y.date)).toEqual(['2024-02-29']);
    expect(onThisDay(leap, '2026-02-28').map((y) => y.date)).toEqual(['2023-02-28']);
  });
});
