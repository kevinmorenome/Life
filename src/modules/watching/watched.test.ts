import { describe, expect, it } from 'vitest';
import type { Play } from './types';
import { byDate, dayLabel, dayStreak, dayTitles, episodeCode, hourCounts, monthlyCounts, newestFirst, searchPlays, summarize, topTitles, weekdayCounts, when } from './watched';

let n = 0;
/** A play at a local date and time, so tests don't depend on the machine's time zone. */
const play = (title: string, date: string, time = '20:00', extra: Partial<Play> = {}): Play => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return { id: `trakt-${++n}`, kind: 'movie', title, at: new Date(y, m - 1, d, h, min).toISOString(), source: 'trakt', createdAt: '', updatedAt: '', ...extra };
};
const ep = (show: string, date: string, season: number, number: number, time = '20:00', extra: Partial<Play> = {}) =>
  play(show, date, time, { kind: 'episode', season, number, traktId: show.length, ...extra });

describe('when', () => {
  it('gives the local date and time', () => {
    expect(when(play('A', '2026-10-30', '23:30'))).toEqual({ date: '2026-10-30', time: '23:30' });
  });
});

describe('byDate / labels', () => {
  const list = [play('B', '2026-10-30', '21:00'), play('A', '2026-10-30', '18:00'), ep('Show', '2026-10-30', 1, 2, '22:00'), ep('Show', '2026-10-30', 1, 3, '22:30'), play('C', '2026-10-31')];
  it('groups by day, earliest first', () => {
    const days = byDate(list);
    expect([...days.keys()]).toEqual(['2026-10-30', '2026-10-31']);
    expect(days.get('2026-10-30')!.map((p) => p.title)).toEqual(['A', 'B', 'Show', 'Show']);
  });
  it('lists each title once and labels the day', () => {
    const day = byDate(list).get('2026-10-30')!;
    expect(dayTitles(day)).toEqual(['A', 'B', 'Show']);
    expect(dayLabel(day)).toBe('3 titles');
    expect(dayLabel([day[0]])).toBe('A');
    expect(dayLabel([day[2], day[3]])).toBe('Show');
  });
});

describe('episodeCode', () => {
  it('pads season and episode, and is empty for movies', () => {
    expect(episodeCode(ep('S', '2026-01-01', 2, 3))).toBe('S02E03');
    expect(episodeCode(play('M', '2026-01-01'))).toBe('');
  });
});

describe('summarize', () => {
  const list = [play('M', '2026-01-05'), ep('Ab', '2026-02-01', 1, 1), ep('Ab', '2026-02-02', 1, 2), ep('Cde', '2025-12-31', 1, 1)];
  it('counts movies, episodes and different shows', () => {
    expect(summarize(list)).toMatchObject({ plays: 4, movies: 1, episodes: 3, shows: 2, since: '2025-12-31' });
    expect(summarize(list, '2026')).toMatchObject({ plays: 3, movies: 1, episodes: 2, shows: 1, since: '2026-01-05' });
    expect(summarize(list, '2030')).toMatchObject({ plays: 0, shows: 0, since: undefined });
  });
});

describe('topTitles', () => {
  const list = [ep('Ab', '2026-02-01', 1, 1), ep('Ab', '2026-02-01', 1, 2), ep('Ab', '2026-02-02', 1, 3), play('M', '2026-02-03'), play('M', '2026-03-03'), play('Z', '2026-03-04')];
  it('ranks shows by episodes and movies by plays, with distinct days', () => {
    const rows = topTitles(list);
    expect(rows.map((r) => [r.title, r.count, r.days, r.last])).toEqual([
      ['Ab', 3, 2, '2026-02-02'],
      ['M', 2, 2, '2026-03-03'],
      ['Z', 1, 1, '2026-03-04'],
    ]);
  });
  it('filters by period and kind', () => {
    expect(topTitles(list, '2026-03').map((r) => r.title)).toEqual(['Z', 'M']);
    expect(topTitles(list, '', 'episode').map((r) => r.title)).toEqual(['Ab']);
  });
});

describe('monthlyCounts', () => {
  it('returns a window of months with empty ones included', () => {
    const rows = monthlyCounts([play('M', '2026-02-03'), ep('S', '2026-03-01', 1, 1), ep('S', '2026-03-02', 1, 2), play('old', '2020-01-01')], '2026-03', 3);
    expect(rows).toEqual([
      { month: '2026-01', movies: 0, episodes: 0 },
      { month: '2026-02', movies: 1, episodes: 0 },
      { month: '2026-03', movies: 0, episodes: 2 },
    ]);
  });
  it('crosses a year boundary', () => {
    expect(monthlyCounts([], '2026-01', 2).map((r) => r.month)).toEqual(['2025-12', '2026-01']);
  });
});

describe('weekdayCounts / hourCounts', () => {
  const list = [play('A', '2026-11-02', '08:15'), play('B', '2026-11-08', '23:59'), play('C', '2026-11-08', '23:00')];
  it('counts Monday first', () => {
    // 2026-11-02 is a Monday, 2026-11-08 a Sunday.
    expect(weekdayCounts(list)).toEqual([1, 0, 0, 0, 0, 0, 2]);
  });
  it('counts by hour', () => {
    const hours = hourCounts(list);
    expect(hours[8]).toBe(1);
    expect(hours[23]).toBe(2);
    expect(hours.reduce((a, b) => a + b)).toBe(3);
  });
});

describe('dayStreak', () => {
  const list = [play('A', '2026-10-29'), play('B', '2026-10-30'), play('C', '2026-10-31'), play('D', '2026-10-31', '23:00'), play('E', '2026-10-01'), play('F', '2026-10-02')];
  it('counts days in a row, longest and current', () => {
    expect(dayStreak(list, '2026-10-31')).toEqual({ current: 3, longest: 3 });
    expect(dayStreak(list, '2026-11-01')).toEqual({ current: 3, longest: 3 });
    expect(dayStreak(list, '2026-11-02')).toEqual({ current: 0, longest: 3 });
    expect(dayStreak([], '2026-11-02')).toEqual({ current: 0, longest: 0 });
  });
});

describe('newestFirst / searchPlays', () => {
  const list = [play('Alien', '2026-01-01'), ep('Severance', '2026-02-01', 2, 5, '20:00', { episodeTitle: 'Trojan' }), play('Heat', '2026-03-01')];
  it('sorts newest first', () => {
    expect(newestFirst(list).map((p) => p.title)).toEqual(['Heat', 'Severance', 'Alien']);
  });
  it('matches words in title, episode title, code and date', () => {
    expect(searchPlays(list, '').length).toBe(3);
    expect(searchPlays(list, 'sever troj').map((p) => p.title)).toEqual(['Severance']);
    expect(searchPlays(list, 's02e05').length).toBe(1);
    expect(searchPlays(list, '2026-03').map((p) => p.title)).toEqual(['Heat']);
    expect(searchPlays(list, 'nothing')).toEqual([]);
  });
});
