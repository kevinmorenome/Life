import { describe, expect, it } from 'vitest';
import { withPriorWears } from './wear';

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
