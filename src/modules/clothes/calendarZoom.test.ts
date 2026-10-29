import { describe, expect, it } from 'vitest';
import { monthOfWeek, mondayOf, pinchStep, stepZoom, weekDays, weekStarts } from './calendarZoom';

describe('stepZoom', () => {
  it('moves one level and stops at the ends', () => {
    expect(stepZoom('standard', 1)).toBe('detail');
    expect(stepZoom('standard', -1)).toBe('compact');
    expect(stepZoom('detail', 1)).toBe('detail');
    expect(stepZoom('compact', -1)).toBe('compact');
  });
});

describe('pinchStep', () => {
  it('needs a clear spread or pinch', () => {
    expect(pinchStep(100, 130)).toBe(1);
    expect(pinchStep(100, 70)).toBe(-1);
    expect(pinchStep(100, 110)).toBe(0);
    expect(pinchStep(100, 90)).toBe(0);
    expect(pinchStep(0, 90)).toBe(0);
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
