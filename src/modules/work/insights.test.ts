import { describe, expect, it } from 'vitest';
import { arrivalBins, attendanceStreaks, dayGrid, filterRange, mondayOf, officeShare, statusCounts, timeExtremes, weeklyCounts } from './insights';
import type { DayInfo } from './work';

type Spec = [string, DayInfo['status'], Partial<DayInfo>?];
const infos = (...specs: Spec[]) => new Map<string, DayInfo>(specs.map(([date, status, extra]) => [date, { status, manual: true, ...extra }]));

// October 2026: Mon 5th … Fri 9th, Mon 12th … Fri 16th.
describe('statusCounts and officeShare', () => {
  const m = infos(['2026-10-05', 'office'], ['2026-10-06', 'office'], ['2026-10-07', 'home'], ['2026-10-08', 'trip'], ['2026-09-30', 'off']);
  it('counts each kind within a period', () => {
    expect(statusCounts(m, '2026-10')).toEqual({ office: 2, home: 1, off: 0, trip: 1 });
    expect(statusCounts(m)).toEqual({ office: 2, home: 1, off: 1, trip: 1 });
  });
  it('shares office out of office + home, ignoring trips and days off', () => {
    expect(officeShare(2, 1)).toBe(67);
    expect(officeShare(0, 0)).toBeUndefined();
  });
});

describe('filterRange', () => {
  const m = infos(['2026-09-30', 'office'], ['2026-10-05', 'home'], ['2026-10-20', 'office']);
  it('keeps the days within an inclusive range, open at either end', () => {
    expect([...filterRange(m, '2026-10-01', '2026-10-31').keys()]).toEqual(['2026-10-05', '2026-10-20']);
    expect([...filterRange(m, '2026-10-05', '2026-10-05').keys()]).toEqual(['2026-10-05']);
    expect([...filterRange(m, '2026-10-06').keys()]).toEqual(['2026-10-20']);
    expect(filterRange(m)).toBe(m);
  });
  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
  });
});

describe('attendanceStreaks', () => {
  it('counts consecutive workdays and lets weekends, days off and trips pass', () => {
    const m = infos(
      ['2026-10-05', 'office'], ['2026-10-06', 'office'], ['2026-10-07', 'trip'], ['2026-10-08', 'office'], ['2026-10-09', 'home'],
      ['2026-10-12', 'home'], ['2026-10-13', 'off'], ['2026-10-14', 'home'],
    );
    expect(attendanceStreaks(m, '2026-10-14')).toEqual({ office: { current: 0, longest: 3 }, home: { current: 3, longest: 3 } });
  });
  it('breaks on a weekday with nothing logged, but not on today', () => {
    const m = infos(['2026-10-05', 'office'], ['2026-10-06', 'office'], ['2026-10-08', 'office']);
    expect(attendanceStreaks(m, '2026-10-08').office).toEqual({ current: 1, longest: 2 });
    expect(attendanceStreaks(m, '2026-10-09').office).toEqual({ current: 1, longest: 2 });
    expect(attendanceStreaks(infos(['2026-10-05', 'office'], ['2026-10-06', 'office']), '2026-10-07').office.current).toBe(2);
  });
  it('is empty with no data', () => {
    expect(attendanceStreaks(new Map(), '2026-10-14').office).toEqual({ current: 0, longest: 0 });
  });
});

describe('weeklyCounts and dayGrid', () => {
  const m = infos(['2026-10-05', 'office'], ['2026-10-07', 'home'], ['2026-10-13', 'office'], ['2026-10-14', 'office']);
  it('lists weeks oldest first, ending with this week', () => {
    expect(weeklyCounts(m, '2026-10-14', 2)).toEqual([
      { start: '2026-10-05', office: 1, home: 1 },
      { start: '2026-10-12', office: 2, home: 0 },
    ]);
  });
  it('lays days out Monday to Sunday and marks the future', () => {
    const g = dayGrid(m, '2026-10-14', 2);
    expect(g).toHaveLength(2);
    expect(g[0].map((c) => c.date)[0]).toBe('2026-10-05');
    expect(g[0][0]).toMatchObject({ status: 'office', future: false });
    expect(g[1][3]).toMatchObject({ date: '2026-10-15', future: true });
  });
});

describe('arrivalBins and timeExtremes', () => {
  const m = infos(
    ['2026-10-05', 'office', { arrive: '09:10', leave: '18:00' }],
    ['2026-10-06', 'office', { arrive: '09:45', leave: '17:30' }],
    ['2026-10-07', 'office', { arrive: '06:30' }],
    ['2026-10-08', 'office', { arrive: '11:15' }],
    ['2026-10-09', 'home', { arrive: '08:00', leave: '19:30' }],
  );
  it('bins office arrivals by half hour, clamping early and late ones', () => {
    const bins = arrivalBins(m);
    expect(bins[0]).toEqual({ start: '07:00', count: 1 });
    expect(bins.find((b) => b.start === '09:00')?.count).toBe(1);
    expect(bins.find((b) => b.start === '09:30')?.count).toBe(1);
    expect(bins.at(-1)).toEqual({ start: '10:30', count: 1 });
    expect(arrivalBins(new Map())).toEqual([]);
  });
  it('finds the earliest start, latest finish and longest day', () => {
    expect(timeExtremes(m)).toEqual({
      earliest: { date: '2026-10-07', time: '06:30' },
      latest: { date: '2026-10-09', time: '19:30' },
      longest: { date: '2026-10-09', minutes: 690 },
    });
  });
});
