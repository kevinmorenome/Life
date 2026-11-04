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
