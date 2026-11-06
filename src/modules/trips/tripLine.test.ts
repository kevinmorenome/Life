import { describe, expect, it } from 'vitest';
import { tripDayShape } from './tripLine';

// 2026-11-04 is a Wednesday, so the 9th is the next Monday.
const trip = { startDate: '2026-11-04', endDate: '2026-11-11' };

describe('tripDayShape', () => {
  it('starts at the number on the first day, and has the line all day after that, the last day too', () => {
    expect(tripDayShape(trip, '2026-11-04')).toEqual({ line: 'from', flag: true });
    expect(tripDayShape(trip, '2026-11-05')).toEqual({ line: 'through', flag: false });
    expect(tripDayShape(trip, '2026-11-11')).toEqual({ line: 'through', flag: false });
  });

  it('shows the flag again on the Monday where the next week\'s line begins', () => {
    expect(tripDayShape(trip, '2026-11-09')).toEqual({ line: 'through', flag: true });
    expect(tripDayShape(trip, '2026-11-08').flag).toBe(false);
  });

  it('gives a one-day trip its line and flag too', () => {
    expect(tripDayShape({ startDate: '2026-11-04', endDate: '2026-11-04' }, '2026-11-04')).toEqual({ line: 'from', flag: true });
  });

  it('puts the flag on the last day when it is a Monday', () => {
    expect(tripDayShape({ startDate: '2026-11-07', endDate: '2026-11-09' }, '2026-11-09')).toEqual({ line: 'through', flag: true });
  });
});
