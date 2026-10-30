import { describe, expect, it } from 'vitest';
import type { WorkDay, WorkEvent } from './types';
import { buildDays, formatDuration, formatMinutes, monthHistory, monthSummary, targetProgress, timeStats, weekdaySplit } from './work';

const stamp = '2026-10-01T00:00:00Z';
const ev = (type: WorkEvent['type'], date: string, time = '09:00'): WorkEvent => ({
  id: `${type}-${date}-${time}`,
  type,
  date,
  time,
  source: 'shortcut',
  createdAt: stamp,
  updatedAt: stamp,
});
const day = (id: string, status: WorkDay['status']): WorkDay => ({ id, status, updatedAt: stamp });

describe('buildDays', () => {
  it('reads arrivals and departures as an office day with times', () => {
    const d = buildDays([], [ev('arrive', '2026-10-05', '08:40'), ev('arrive', '2026-10-05', '08:55'), ev('leave', '2026-10-05', '17:10'), ev('leave', '2026-10-05', '17:30')]);
    expect(d.get('2026-10-05')).toEqual({ status: 'office', manual: false, arrive: '08:40', leave: '17:30' });
  });

  it('reads an end-of-day home check-in as home, but arrival wins', () => {
    const d = buildDays([], [ev('home', '2026-10-06', '18:00'), ev('home', '2026-10-07', '18:00'), ev('arrive', '2026-10-07')]);
    expect(d.get('2026-10-06')?.status).toBe('home');
    expect(d.get('2026-10-07')?.status).toBe('office');
  });

  it('lets a day set by hand win while keeping the reported times', () => {
    const d = buildDays([day('2026-10-05', 'off')], [ev('arrive', '2026-10-05', '09:00')]);
    expect(d.get('2026-10-05')).toEqual({ status: 'off', manual: true, arrive: '09:00' });
  });

  it('uses times entered by hand over check-in times, on any kind of day', () => {
    const d = buildDays(
      [{ ...day('2026-10-05', 'home'), arrive: '08:30', leave: '17:00' }, { ...day('2026-10-06', 'office'), arrive: '09:15' }],
      [ev('arrive', '2026-10-05', '07:00'), ev('arrive', '2026-10-06', '08:00'), ev('leave', '2026-10-06', '18:00')],
    );
    expect(d.get('2026-10-05')).toMatchObject({ status: 'home', arrive: '08:30', leave: '17:00' });
    expect(d.get('2026-10-06')).toMatchObject({ arrive: '09:15', leave: '18:00' });
  });

  it('keeps the reason a day is off', () => {
    expect(buildDays([{ ...day('2026-10-05', 'off'), reason: 'holiday' }], []).get('2026-10-05')?.reason).toBe('holiday');
  });

  it('leaves days with no data out', () => {
    expect(buildDays([], []).size).toBe(0);
  });
});

describe('monthSummary', () => {
  const infos = buildDays(
    [day('2026-10-01', 'office'), day('2026-10-02', 'home'), day('2026-10-05', 'home'), day('2026-10-06', 'off')],
    [ev('arrive', '2026-10-07')],
  );

  it('counts statuses and the weekdays that could still become office days', () => {
    // October 2026 has 22 weekdays; one is off. From the 8th on, 17 weekdays are still open.
    expect(monthSummary('2026-10', infos, '2026-10-08')).toEqual({ office: 2, home: 2, off: 1, trip: 0, workdays: 21, open: 17 });
  });

  it('treats today as still open when it has no status yet', () => {
    expect(monthSummary('2026-10', infos, '2026-10-30').open).toBe(1);
  });
});

describe('targetProgress', () => {
  const s = { office: 4, home: 6, off: 0, trip: 0, workdays: 22, open: 10 };

  it('counts office days toward a minimum', () => {
    expect(targetProgress(s, 7, 'min-office')).toEqual({ count: 4, target: 7, left: 3, met: false, reachable: true, needsApproval: false, overExtended: false });
    expect(targetProgress({ ...s, open: 2 }, 7, 'min-office').reachable).toBe(false);
    expect(targetProgress({ ...s, office: 9 }, 7, 'min-office')).toMatchObject({ left: 0, met: true });
  });

  it('counts home days against a cap', () => {
    expect(targetProgress(s, 7, 'max-home')).toMatchObject({ count: 6, left: 1, met: true });
    expect(targetProgress({ ...s, home: 9 }, 7, 'max-home')).toMatchObject({ left: -2, met: false, reachable: false });
  });

  it('flags home days past the cap that you can still request, and past that', () => {
    expect(targetProgress({ ...s, home: 8 }, 7, 'max-home', 10)).toMatchObject({ met: false, needsApproval: true, overExtended: false });
    expect(targetProgress({ ...s, home: 10 }, 7, 'max-home', 10)).toMatchObject({ needsApproval: true, overExtended: false });
    expect(targetProgress({ ...s, home: 11 }, 7, 'max-home', 10)).toMatchObject({ needsApproval: false, overExtended: true });
    expect(targetProgress({ ...s, home: 7 }, 7, 'max-home', 10)).toMatchObject({ met: true, needsApproval: false });
  });
});

describe('timeStats', () => {
  it('averages arrival, leaving and time on site over office days', () => {
    const infos = buildDays(
      [],
      [ev('arrive', '2026-10-05', '08:00'), ev('leave', '2026-10-05', '17:00'), ev('arrive', '2026-10-06', '09:00'), ev('leave', '2026-10-06', '18:00'), ev('arrive', '2026-10-07', '10:00')],
    );
    const t = timeStats(infos, '2026-10');
    expect(t.days).toBe(3);
    expect(formatMinutes(t.arrive!)).toBe('09:00');
    expect(formatMinutes(t.leave!)).toBe('17:30');
    expect(formatDuration(t.duration!)).toBe('9h 00m');
  });

  it('averages home days separately, from the times you entered', () => {
    const infos = buildDays(
      [{ ...day('2026-10-05', 'home'), arrive: '08:00', leave: '16:00' }, { ...day('2026-10-06', 'home'), arrive: '09:00', leave: '18:00' }, day('2026-10-07', 'home')],
      [ev('arrive', '2026-10-08', '10:00')],
    );
    const t = timeStats(infos, '2026-10', 'home');
    expect(t.days).toBe(3);
    expect(formatMinutes(t.arrive!)).toBe('08:30');
    expect(formatDuration(t.duration!)).toBe('8h 30m');
  });

  it('ignores home days and a leave that is not after the arrival', () => {
    const infos = buildDays([day('2026-10-05', 'home')], [ev('arrive', '2026-10-05', '09:00'), ev('arrive', '2026-10-06', '12:00'), ev('leave', '2026-10-06', '08:00')]);
    expect(timeStats(infos).days).toBe(1);
    expect(timeStats(infos).duration).toBeUndefined();
  });
});

describe('trips', () => {
  it('count on their own, not as office or home', () => {
    const infos = buildDays([day('2026-10-05', 'trip'), day('2026-10-06', 'trip'), day('2026-10-07', 'home')], []);
    expect(monthSummary('2026-10', infos, '2026-10-30')).toMatchObject({ trip: 2, home: 1, office: 0 });
    expect(monthHistory('2026-10', infos, 1)[0]).toMatchObject({ trip: 2, home: 1 });
    expect(weekdaySplit(infos, '2026-10').flatMap((w) => [w.office, w.home])).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
  });
});

describe('monthHistory and weekdaySplit', () => {
  const infos = buildDays([day('2026-09-30', 'home'), day('2026-10-05', 'office'), day('2026-10-06', 'home'), day('2026-10-07', 'home')], []);

  it('lists the last months oldest first, including empty ones', () => {
    expect(monthHistory('2026-10', infos, 3)).toEqual([
      { month: '2026-08', office: 0, home: 0, off: 0, trip: 0 },
      { month: '2026-09', office: 0, home: 1, off: 0, trip: 0 },
      { month: '2026-10', office: 1, home: 2, off: 0, trip: 0 },
    ]);
  });

  it('splits days by weekday, Monday first', () => {
    expect(weekdaySplit(infos, '2026-10')).toEqual([{ office: 1, home: 0 }, { office: 0, home: 1 }, { office: 0, home: 1 }, { office: 0, home: 0 }, { office: 0, home: 0 }]);
  });
});
