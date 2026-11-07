import { describe, expect, it } from 'vitest';
import { dayStreak, daysBefore, duration, hourPlays, monthlyTotals, parseUser, summarize, syncFrom, topOf, weekdayPlays } from './music';
import type { MusicDay } from './types';

const day = (date: string, over: Partial<MusicDay> = {}): MusicDay => ({
  id: `music-${date}`,
  date,
  plays: 10,
  ms: 3_600_000,
  tracks: 8,
  artists: 4,
  hours: Array.from({ length: 24 }, (_, h) => (h === 9 ? 10 : 0)),
  topTracks: [],
  topArtists: [],
  source: 'statsfm',
  updatedAt: '',
  ...over,
});

describe('syncFrom', () => {
  it('starts from the beginning with nothing stored, else two days before the newest day', () => {
    expect(syncFrom([])).toBeUndefined();
    expect(syncFrom([day('2026-11-03'), day('2026-10-01')])).toBe('2026-11-01');
    expect(daysBefore('2026-03-01', 2)).toBe('2026-02-27');
  });
});

describe('parseUser', () => {
  it('takes an ID or the last part of a link', () => {
    expect(parseUser('kevinmorenom')).toBe('kevinmorenom');
    expect(parseUser(' https://stats.fm/kevinmorenom/ ')).toBe('kevinmorenom');
    expect(parseUser('https://stats.fm/invite/kevinmorenom')).toBe('kevinmorenom');
    expect(parseUser('https://stats.fm/user/kevinmorenom?x=1')).toBe('kevinmorenom');
    expect(parseUser('https://stats.fm/invite')).toBeNull();
    expect(parseUser('')).toBeNull();
  });
});

describe('duration', () => {
  it('reads minutes under an hour, else hours and minutes', () => {
    expect(duration(45 * 60_000)).toBe('45 min');
    expect(duration(2 * 3_600_000)).toBe('2h');
    expect(duration(2 * 3_600_000 + 5 * 60_000)).toBe('2h 05m');
  });
});

describe('stats', () => {
  const days = [day('2026-10-31'), day('2026-11-01', { plays: 20, ms: 7_200_000 }), day('2026-11-03')];

  it('summarizes a period', () => {
    expect(summarize(days, '2026-11')).toEqual({ plays: 30, ms: 10_800_000, activeDays: 2 });
    expect(summarize(days).plays).toBe(40);
  });

  it('sums the days\' top lists', () => {
    const a = day('2026-11-01', { topArtists: [{ id: 1, name: 'A', plays: 5 }, { id: 2, name: 'B', plays: 2 }] });
    const b = day('2026-11-02', { topArtists: [{ id: 2, name: 'B', plays: 6 }] });
    expect(topOf([a, b], 'topArtists')).toEqual([{ id: 2, name: 'B', plays: 8, days: 2 }, { id: 1, name: 'A', plays: 5, days: 1 }]);
    expect(topOf([a, b], 'topArtists', '2026-11', 1)).toHaveLength(1);
  });

  it('totals months, weekdays and hours', () => {
    const months = monthlyTotals(days, '2026-11', 3);
    expect(months.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(months[2]).toMatchObject({ plays: 30, ms: 10_800_000 });
    expect(weekdayPlays([day('2026-11-02')])).toEqual([10, 0, 0, 0, 0, 0, 0]); // a Monday
    expect(hourPlays(days)[9]).toBe(30);
  });

  it('counts the day streak, forgiving a day with no listening yet today', () => {
    expect(dayStreak([day('2026-11-01'), day('2026-11-02'), day('2026-11-03')], '2026-11-03')).toEqual({ current: 3, longest: 3 });
    expect(dayStreak([day('2026-11-01'), day('2026-11-02')], '2026-11-03').current).toBe(2);
    expect(dayStreak([day('2026-11-01'), day('2026-11-02')], '2026-11-05').current).toBe(0);
    expect(dayStreak([], '2026-11-03')).toEqual({ current: 0, longest: 0 });
  });
});
