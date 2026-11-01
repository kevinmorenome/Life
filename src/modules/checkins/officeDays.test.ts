import { describe, expect, it } from 'vitest';
import type { WorkDay } from '../work/types';
import { isWeekday, officeBackfill } from './officeDays';
import type { Checkin } from './types';

const ci = (id: string, venueId: string, date: string): Checkin => ({
  id,
  venueId,
  venue: venueId,
  date,
  time: '09:00',
  at: 0,
  source: 'swarm',
  createdAt: '',
  updatedAt: '',
});

describe('isWeekday', () => {
  it('is Monday to Friday', () => {
    expect(['2026-10-05', '2026-10-09'].every(isWeekday)).toBe(true); // Mon, Fri
    expect(['2026-10-10', '2026-10-11'].some(isWeekday)).toBe(false); // Sat, Sun
  });
});

describe('officeBackfill', () => {
  const NOW = '2026-10-31T00:00:00Z';
  const checkins = [
    ci('1', 'office', '2026-10-05'),
    ci('2', 'office', '2026-10-05'), // same day twice
    ci('3', 'office', '2026-10-06'),
    ci('4', 'office', '2026-10-10'), // Saturday
    ci('5', 'cafe', '2026-10-07'), // other place
    ci('6', 'office', '2026-10-08'), // already set by hand
    ci('7', 'office', '2026-10-09'), // already from the report
  ];
  const existing: WorkDay[] = [
    { id: '2026-10-08', status: 'home', updatedAt: '' },
    { id: '2026-10-09', status: 'home', source: 'report', updatedAt: '' },
  ];

  it('marks weekdays with a check-in at the office that have nothing recorded', () => {
    expect(officeBackfill(checkins, 'office', existing, NOW)).toEqual([
      { id: '2026-10-05', status: 'office', source: 'swarm', updatedAt: NOW },
      { id: '2026-10-06', status: 'office', source: 'swarm', updatedAt: NOW },
    ]);
  });

  it('is idempotent once written', () => {
    const first = officeBackfill(checkins, 'office', existing, NOW);
    expect(officeBackfill(checkins, 'office', [...existing, ...first], NOW)).toEqual([]);
  });
});
