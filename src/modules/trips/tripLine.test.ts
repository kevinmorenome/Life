import { describe, expect, it } from 'vitest';
import { tripDayShape } from './tripLine';

// 2026-11-04 is a Wednesday, so the 9th is the next Monday.
const trip = { startDate: '2026-11-04', endDate: '2026-11-11' };

describe('tripDayShape', () => {
  it('starts at the first day with the flag, runs through, and ends at the last day', () => {
    expect(tripDayShape(trip, '2026-11-04')).toEqual({ line: 'from', flag: true });
    expect(tripDayShape(trip, '2026-11-05')).toEqual({ line: 'through', flag: false });
    expect(tripDayShape(trip, '2026-11-11')).toEqual({ line: 'to', flag: false });
  });

  it('shows the flag again on the Monday where the next week\'s line begins', () => {
    expect(tripDayShape(trip, '2026-11-09')).toEqual({ line: 'through', flag: true });
    expect(tripDayShape(trip, '2026-11-08').flag).toBe(false);
  });

  it('is just the flag for a one-day trip', () => {
    expect(tripDayShape({ startDate: '2026-11-04', endDate: '2026-11-04' }, '2026-11-04')).toEqual({ line: 'none', flag: true });
  });

  it('puts the flag on the last day when it is a Monday', () => {
    expect(tripDayShape({ startDate: '2026-11-07', endDate: '2026-11-09' }, '2026-11-09')).toEqual({ line: 'to', flag: true });
  });
});
