import { describe, expect, it } from 'vitest';
import { agoText, cookedByDate, cookedPerMonth, cookedPerWeekday, cookingStream, cookingStreaks, forgotten, mostCooked } from './cookStats';
import type { Recipe } from './types';

const recipe = (id: string, cooked: string[] = []): Recipe => ({ id, name: id, ingredients: [], steps: [], servings: 2, tags: [], cooked, createdAt: '', updatedAt: '' });
const pesto = recipe('Pesto tortellini', ['2026-11-01', '2026-11-09', '2026-11-10', '2026-11-10']);
const curry = recipe('Curry', ['2026-11-10', '2026-09-01']);
const soup = recipe('Soup');
const all = [pesto, curry, soup];

describe('cookingStream', () => {
  it('lists every cooked day, newest first, once per recipe and day', () => {
    expect(cookingStream(all).map((c) => `${c.date} ${c.recipe.name}`)).toEqual(['2026-11-10 Curry', '2026-11-10 Pesto tortellini', '2026-11-09 Pesto tortellini', '2026-11-01 Pesto tortellini', '2026-09-01 Curry']);
    expect(cookedByDate(all).get('2026-11-10')?.map((r) => r.name)).toEqual(['Curry', 'Pesto tortellini']);
  });
});

describe('cookingStreaks', () => {
  const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-09', '2026-11-10'];
  it('counts the run up to today, or yesterday when today is still open', () => {
    expect(cookingStreaks(days, '2026-11-10')).toEqual({ current: 2, longest: 3 });
    expect(cookingStreaks(days, '2026-11-11')).toEqual({ current: 2, longest: 3 });
    expect(cookingStreaks(days, '2026-11-12')).toEqual({ current: 0, longest: 3 });
    expect(cookingStreaks([], '2026-11-12')).toEqual({ current: 0, longest: 0 });
  });
  it('crosses months', () => {
    expect(cookingStreaks(['2026-10-31', '2026-11-01'], '2026-11-01').current).toBe(2);
  });
});

describe('counts', () => {
  it('ranks the most cooked', () => {
    expect(mostCooked(all).map((r) => [r.recipe.name, r.times, r.last])).toEqual([
      ['Pesto tortellini', 3, '2026-11-10'],
      ['Curry', 2, '2026-11-10'],
    ]);
  });
  it('counts per month and weekday', () => {
    const s = cookingStream(all);
    expect(cookedPerMonth(s, '2026-11-11', 3)).toEqual([
      { month: '2026-09', times: 1 },
      { month: '2026-10', times: 0 },
      { month: '2026-11', times: 4 },
    ]);
    // 2026-11-10 is a Tuesday, 11-09 a Monday, 11-01 a Sunday, 09-01 a Tuesday.
    expect(cookedPerWeekday(s)).toEqual([1, 3, 0, 0, 0, 0, 1]);
  });
  it('finds what was not cooked lately, and never', () => {
    const f = forgotten([recipe('Old', ['2026-08-01']), pesto, soup], '2026-11-11');
    expect(f.notLately.map((r) => r.recipe.name)).toEqual(['Old']);
    expect(f.never.map((r) => r.name)).toEqual(['Soup']);
  });
});

describe('agoText', () => {
  it('says how long ago', () => {
    expect(agoText('2026-11-11', '2026-11-11')).toBe('today');
    expect(agoText('2026-11-10', '2026-11-11')).toBe('yesterday');
    expect(agoText('2026-11-06', '2026-11-11')).toBe('5 days ago');
    expect(agoText('2026-10-01', '2026-11-11')).toBe('6 weeks ago');
    expect(agoText('2026-05-01', '2026-11-11')).toBe('6 months ago');
  });
});
