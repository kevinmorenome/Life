import { describe, expect, it } from 'vitest';
import { targetNote, targetTone } from './targetNote';
import type { MonthSummary } from './work';

const month = (home: number, office = 0): MonthSummary => ({ office, home, trip: 0, off: 0, open: 5 }) as MonthSummary;

describe('targetNote', () => {
  it('says how many home days are left this month', () => {
    expect(targetNote(month(5), 7, 'max-home', 10, false)).toBe('2 wfh days left');
    expect(targetNote(month(6), 7, 'max-home', 10, false)).toBe('1 wfh day left');
    expect(targetNote(month(0), 7, 'max-home', 10, false)).toBe('7 wfh days left');
  });
  it('says how many were over the target', () => {
    expect(targetNote(month(8), 7, 'max-home', 10, false)).toBe('1 wfh day over');
  });
  it('says how many were used in a month that is over', () => {
    expect(targetNote(month(5), 7, 'max-home', 10, true)).toBe('5 wfh days used');
    expect(targetNote(month(1), 7, 'max-home', 10, true)).toBe('1 wfh day used');
  });
  it('handles an office target', () => {
    expect(targetNote(month(0, 4), 7, 'min-office', 7, false)).toBe('3 office days to go');
    expect(targetNote(month(0, 7), 7, 'min-office', 7, false)).toBe('office target reached');
    expect(targetNote(month(0, 4), 7, 'min-office', 7, true)).toBe('4 office days');
  });

  it('colours by how much is left', () => {
    expect(targetTone(month(2), 7, 'max-home', 10, false)).toBe('plenty');
    expect(targetTone(month(5), 7, 'max-home', 10, false)).toBe('low');
    expect(targetTone(month(7), 7, 'max-home', 10, false)).toBe('out');
    expect(targetTone(month(8), 7, 'max-home', 10, false)).toBe('out');
    expect(targetTone(month(5), 7, 'max-home', 10, true)).toBe('done');
    expect(targetTone(month(9), 7, 'max-home', 10, true)).toBe('out');
  });
});
