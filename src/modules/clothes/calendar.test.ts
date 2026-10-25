import { describe, expect, it } from 'vitest';
import { addMonths, monthGrid, wearsByDay } from './calendar';
import type { ClothingItem, Outfit } from './types';

const item = (id: string, wears: string[]): ClothingItem => ({
  id,
  name: id,
  category: 'tops',
  seasons: [],
  status: 'active',
  wears,
  createdAt: 'x',
  updatedAt: 'x',
});

describe('calendar', () => {
  it('builds Monday-first weeks for a month', () => {
    const may = monthGrid(2026, 5); // May 1, 2026 is a Friday
    expect(may[0].map((c) => c.date)).toEqual([
      '2026-04-27', '2026-04-28', '2026-04-29', '2026-04-30', '2026-05-01', '2026-05-02', '2026-05-03',
    ]);
    expect(may[0][3].inMonth).toBe(false);
    expect(may[0][4].inMonth).toBe(true);
    expect(may.at(-1)!.at(-1)!.date).toBe('2026-05-31');
    expect(may).toHaveLength(5);
    expect(monthGrid(2026, 6)[0][0].date).toBe('2026-06-01'); // starts on a Monday
  });

  it('moves between months across years', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });

  it('groups wears by day, without repeating pieces of an outfit worn that day', () => {
    const outfit: Outfit = { id: 'o', itemIds: ['a'], wears: ['2026-05-10'], createdAt: 'x', updatedAt: 'x' };
    const days = wearsByDay([item('a', ['2026-05-10', '2026-05-11']), item('b', ['2026-05-10'])], [outfit]);
    expect(days.get('2026-05-10')!.outfits.map((o) => o.id)).toEqual(['o']);
    expect(days.get('2026-05-10')!.items.map((i) => i.id)).toEqual(['b']);
    expect(days.get('2026-05-11')!.items.map((i) => i.id)).toEqual(['a']);
    expect(days.has('2026-05-12')).toBe(false);
  });
});
