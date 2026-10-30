// Pure mapping from the employer's badge/time report (semicolon CSV) to WorkDays.
// Type-only imports so Node can run it. The report has personal details in its
// header (name, card number, department); they are never read.

import type { OffReason, WorkDay, WorkStatus } from '../types';

export interface ParsedReport {
  days: WorkDay[];
  /** Report labels the importer doesn't map (and weekends), with how many days each. */
  skipped: Record<string, number>;
}

const KINDS: Record<string, { status: WorkStatus; reason?: OffReason }> = {
  'working time': { status: 'office' },
  'work from home': { status: 'home' },
  'additional work from home': { status: 'home' },
  'business trip': { status: 'trip' },
  holiday: { status: 'off', reason: 'holiday' },
  'paid time off': { status: 'off', reason: 'leave' },
  absence: { status: 'off', reason: 'absence' },
};

const DAY_ROW = /^[A-Za-z]{3}$/;
const DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const TIME = /^(\d{1,2}):(\d{2})$/;

function isoDate(us: string): string | null {
  const m = DATE.exec(us.trim());
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/** "9:05" → "09:05"; the report's " --:--" (no scan) → undefined. */
function clock(raw: string | undefined): string | undefined {
  const m = TIME.exec((raw ?? '').trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined;
}

/**
 * Reads one day per row that starts with a weekday and an M/D/YYYY date.
 * Extra rows below a day (one per scan) are only used to find the day's type
 * when its own row leaves it blank. Weekends are skipped, never invented.
 *
 * Only office days keep times: home days and trips show the same placeholder
 * 08:00–16:00 in the report, so those times are left for you to enter. A day
 * with a single scan (start = end) has no real duration, so it keeps neither.
 */
export function parseBadgeReport(text: string, now: string): ParsedReport {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.split(';'));
  const days: WorkDay[] = [];
  const skipped: Record<string, number> = {};
  const skip = (label: string) => (skipped[label] = (skipped[label] ?? 0) + 1);

  for (let i = 0; i < rows.length; i++) {
    const f = rows[i];
    const id = DAY_ROW.test(f[0]?.trim() ?? '') ? isoDate(f[1] ?? '') : null;
    if (!id) continue;

    let label = (f[7] ?? '').trim();
    for (let j = i + 1; !label && j < rows.length && !rows[j][0]?.trim() && !rows[j][1]?.trim(); j++) {
      label = (rows[j][7] ?? '').trim();
    }
    const kind = KINDS[label.toLowerCase()];
    if (!kind) {
      skip(label || 'No type');
      continue;
    }

    const day: WorkDay = { id, status: kind.status, source: 'report', updatedAt: now };
    if (kind.reason) day.reason = kind.reason;
    if (kind.status === 'office') {
      const arrive = clock(f[2]);
      const leave = clock(f[4]);
      if (arrive && leave && leave > arrive) {
        day.arrive = arrive;
        day.leave = leave;
      } else if (arrive && !leave) {
        day.arrive = arrive; // forgot to badge out
      }
    }
    days.push(day);
  }
  return { days, skipped };
}

const same = (a: WorkDay, b: WorkDay) =>
  a.status === b.status && a.reason === b.reason && a.arrive === b.arrive && a.leave === b.leave;

/**
 * Which parsed days to write. A day you set or edited by hand (no `source`)
 * is never replaced; days from an earlier report are refreshed only if they changed.
 */
export function planImport(parsed: WorkDay[], existing: WorkDay[]): { write: WorkDay[]; kept: number; unchanged: number } {
  const byId = new Map(existing.map((d) => [d.id, d]));
  const write: WorkDay[] = [];
  let kept = 0;
  let unchanged = 0;
  for (const day of parsed) {
    const old = byId.get(day.id);
    if (!old) write.push(day);
    else if (old.source !== 'report') kept++;
    else if (same(old, day)) unchanged++;
    else write.push(day);
  }
  return { write, kept, unchanged };
}
