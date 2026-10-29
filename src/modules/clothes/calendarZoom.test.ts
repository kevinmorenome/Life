import { describe, expect, it } from 'vitest';
import { monthOfWeek, mondayOf, nearestLevel, pinchZoom, weekDays, weekStarts } from './calendarZoom';

describe('pinchZoom', () => {
  it('follows the fingers continuously and stays within the levels', () => {
    expect(pinchZoom(1, 100, 100)).toBe(1);
    expect(pinchZoom(1, 100, 190)).toBeCloseTo(2, 5);
    expect(pinchZoom(1, 100, 100 / 1.9)).toBeCloseTo(0, 5);
    expect(pinchZoom(1, 100, 140)).toBeGreaterThan(1);
    expect(pinchZoom(1, 100, 140)).toBeLessThan(2);
    expect(pinchZoom(1, 100, 1000)).toBe(2);
    expect(pinchZoom(1, 100, 1)).toBe(0);
  });

  it('ignores a pinch with no start distance', () => {
    expect(pinchZoom(1, 0, 90)).toBe(1);
  });
});

describe('nearestLevel', () => {
  it('settles on the closest level', () => {
    expect(nearestLevel(0.4)).toBe(0);
    expect(nearestLevel(0.6)).toBe(1);
    expect(nearestLevel(1.4)).toBe(1);
    expect(nearestLevel(1.6)).toBe(2);
    expect(nearestLevel(5)).toBe(2);
    expect(nearestLevel(-1)).toBe(0);
  });
});

describe('weeks', () => {
  it('finds the Monday of a date', () => {
    expect(mondayOf('2026-10-29')).toBe('2026-10-26');
    expect(mondayOf('2026-10-26')).toBe('2026-10-26');
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
  });

  it('lists every week touching the months, Monday first', () => {
    const weeks = weekStarts('2026-09', '2026-10');
    expect(weeks[0]).toBe('2026-08-31');
    expect(weeks[weeks.length - 1]).toBe('2026-10-26');
    expect(weeks).toHaveLength(9);
    expect(weekDays('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('titles a week by the month of its Thursday', () => {
    expect(monthOfWeek('2026-09-28')).toBe('2026-10');
    expect(monthOfWeek('2026-10-26')).toBe('2026-10');
    expect(monthOfWeek('2026-08-31')).toBe('2026-09');
  });
});
