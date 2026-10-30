import { describe, expect, it } from 'vitest';
import type { WorkDay } from '../types';
import { parseBadgeReport, planImport } from './badgeReport';

const NOW = '2026-10-30T12:00:00Z';

// Made-up report in the same layout as the real one (header block, one row per day,
// extra rows per scan, weekends, placeholder times on home days).
const REPORT = [
  'User;Jane Doe;;;;;;Supervisor;;;',
  'User card;0000000;;;;;;;;;',
  ';;;;;;;;;;',
  'Day;Date;Start;;End;;Total (AWT);Statistic;;;',
  'Wed;10/1/2025;10:04;Entry;18:18;Exit;08:14;Working time;;;',
  'Thu;10/2/2025;08:00;Entry;16:00;Exit;08:00;Work from home;;;',
  'Sat;10/4/2025; --:--;; --:--;; --:--;Weekend;;;',
  'Mon;10/6/2025;9:52;;18:59;;08:42;;;;',
  ';;09:52;Entry;18:34;Exit;08:42;Working time;;;',
  ';;18:59;Entry;18:59;Exit;00:00;Working time;;;',
  'Tue;11/18/2025; --:--;; --:--;;08:00;Holiday;;;',
  'Mon;12/15/2025; --:--;; --:--;; --:--;Paid Time Off;;;',
  'Wed;12/17/2025; --:--;; --:--;; --:--;Absence;;;',
  'Wed;7/1/2026;08:00;Entry;16:00;Exit;08:00;Business trip;;;',
  'Tue;9/1/2026;08:00;Entry;16:00;Exit;08:00;Additional Work from home;;;',
  'Wed;6/3/2026;18:20;Entry;18:20;Exit;00:00;Working time;;;',
  'Fri;10/30/2026;08:40;Entry; --:--;; --:--;Working time;;;',
  'Fri;10/31/2026;08:40;Entry;17:00;Exit;08:20;Mystery;;;',
  '',
  'Legend;;;;;;;;;;',
].join('\r\n');

describe('parseBadgeReport', () => {
  const { days, skipped } = parseBadgeReport(REPORT, NOW);
  const by = (id: string) => days.find((d) => d.id === id);

  it('maps working time to office with its real first entry and last exit', () => {
    expect(by('2025-10-01')).toEqual({ id: '2025-10-01', status: 'office', arrive: '10:04', leave: '18:18', source: 'report', updatedAt: NOW });
  });

  it('uses the day row for a day with several scans, and pads the time', () => {
    expect(by('2025-10-06')).toMatchObject({ status: 'office', arrive: '09:52', leave: '18:59' });
  });

  it('drops the placeholder times on home days and trips', () => {
    expect(by('2025-10-02')).toEqual({ id: '2025-10-02', status: 'home', source: 'report', updatedAt: NOW });
    expect(by('2026-09-01')?.status).toBe('home');
    expect(by('2026-07-01')).toMatchObject({ status: 'trip' });
    expect(by('2026-07-01')?.arrive).toBeUndefined();
  });

  it('keeps off days with their reason', () => {
    expect(by('2025-11-18')).toMatchObject({ status: 'off', reason: 'holiday' });
    expect(by('2025-12-15')).toMatchObject({ status: 'off', reason: 'leave' });
    expect(by('2025-12-17')).toMatchObject({ status: 'off', reason: 'absence' });
  });

  it('keeps only the arrival when the exit is missing, and no times for a single scan', () => {
    expect(by('2026-10-30')).toMatchObject({ status: 'office', arrive: '08:40' });
    expect(by('2026-10-30')?.leave).toBeUndefined();
    expect(by('2026-06-03')).toMatchObject({ status: 'office' });
    expect(by('2026-06-03')?.arrive).toBeUndefined();
  });

  it('skips weekends and unknown types, counting them, and never reads the header', () => {
    expect(by('2025-10-04')).toBeUndefined();
    expect(by('2026-10-31')).toBeUndefined();
    expect(skipped).toEqual({ Weekend: 1, Mystery: 1 });
    expect(days.some((d) => JSON.stringify(d).includes('Jane'))).toBe(false);
  });
});

describe('planImport', () => {
  const parsed = parseBadgeReport(REPORT, NOW).days;
  const hand: WorkDay = { id: '2025-10-01', status: 'home', arrive: '09:00', updatedAt: '2026-10-01T00:00:00Z' };

  it('writes everything into an empty store', () => {
    expect(planImport(parsed, []).write).toHaveLength(parsed.length);
  });

  it('never replaces a day set by hand', () => {
    const plan = planImport(parsed, [hand]);
    expect(plan.kept).toBe(1);
    expect(plan.write.find((d) => d.id === '2025-10-01')).toBeUndefined();
  });

  it('refreshes imported days only when the report changed them', () => {
    const imported = parsed.map((d) => ({ ...d }));
    imported[0] = { ...imported[0], leave: '17:00' };
    const plan = planImport(parsed, imported);
    expect(plan.write.map((d) => d.id)).toEqual([parsed[0].id]);
    expect(plan.unchanged).toBe(parsed.length - 1);
  });
});
