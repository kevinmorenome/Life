import { describe, expect, it } from 'vitest';
import { groupWearsByMonth, withPriorWears } from './wear';

const base = { wears: ['2026-01-01'], updatedAt: 'x' };

describe('withPriorWears', () => {
  it('adjusts the undated count without touching dated wears', () => {
    const up = withPriorWears({ ...base, priorWears: 2 }, 1);
    expect(up.priorWears).toBe(3);
    expect(up.wears).toEqual(['2026-01-01']);
    expect(up.updatedAt).not.toBe('x');
  });

  it('never drops below zero', () => {
    expect(withPriorWears(base, -1).priorWears).toBe(0);
  });
});

describe('groupWearsByMonth', () => {
  it('groups by month, newest first, keeping original indexes', () => {
    const groups = groupWearsByMonth(['2026-07-20', '2026-08-02', '2026-07-25']);
    expect(groups.map((g) => g.month)).toEqual(['2026-08', '2026-07']);
    expect(groups[1].entries).toEqual([
      { date: '2026-07-25', index: 2 },
      { date: '2026-07-20', index: 0 },
    ]);
  });

  it('returns nothing when there are no wears', () => {
    expect(groupWearsByMonth([])).toEqual([]);
  });
});
