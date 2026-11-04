import type { WorkTargetKind } from './types';
import { targetProgress, type MonthSummary } from './work';

/**
 * The one-line note next to the month's title: what is left of the target for this (or a later) month, or what was
 * used in a month that is over.
 */
export function targetNote(summary: MonthSummary, target: number, kind: WorkTargetKind, extended: number, past: boolean): string {
  const p = targetProgress(summary, target, kind, extended);
  if (kind === 'min-office') {
    if (past) return `${p.count} office ${p.count === 1 ? 'day' : 'days'}`;
    return p.met ? 'office target reached' : `${p.left} office ${p.left === 1 ? 'day' : 'days'} to go`;
  }
  if (past) return `${p.count} wfh ${p.count === 1 ? 'day' : 'days'} used`;
  const n = Math.abs(p.left);
  if (p.left < 0) return `${n} wfh ${n === 1 ? 'day' : 'days'} over`;
  return `${n} wfh ${n === 1 ? 'day' : 'days'} left`;
}

export type TargetTone = 'plenty' | 'low' | 'out' | 'done';

/**
 * How the note is coloured: plenty left, running low (a third of the target or less), none left or over it, or a
 * finished month that stayed within the target (neutral). The words already say it; the colour is a glance.
 */
export function targetTone(summary: MonthSummary, target: number, kind: WorkTargetKind, extended: number, past: boolean): TargetTone {
  const p = targetProgress(summary, target, kind, extended);
  if (kind === 'min-office') return p.met ? 'plenty' : past ? 'out' : p.left <= target / 3 ? 'low' : 'plenty';
  if (p.left < 0) return 'out';
  if (past) return 'done';
  if (p.left === 0) return 'out';
  return p.left <= target / 3 ? 'low' : 'plenty';
}
