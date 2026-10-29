import type { WorkTargetKind } from './types';
import { targetProgress, type MonthSummary } from './work';

export interface Target {
  days: number;
  kind: WorkTargetKind;
  /** Higher cap you can request, for 'max-home'. */
  extended: number;
}

/** Office and home counts for a month, with progress toward the monthly number of days. */
export function TargetCard({ summary, target, past }: { summary: MonthSummary; target: Target; past: boolean }) {
  const p = targetProgress(summary, target.days, target.kind, target.extended);
  const noun = target.kind === 'min-office' ? 'office' : 'home';
  let note: string;
  if (target.kind === 'min-office') {
    note = p.met ? 'Target reached' : past ? `Missed by ${p.left}` : p.reachable ? `${p.left} to go` : `${p.left} short, only ${summary.open} weekdays left`;
  } else {
    note = p.met
      ? `${p.left} home ${p.left === 1 ? 'day' : 'days'} left`
      : p.needsApproval
        ? `${-p.left} over: needs approval (up to ${target.extended})`
        : `${-p.left} over, past the ${target.extended} you can request`;
  }
  return (
    <section className="work-target" aria-label="Monthly target">
      <div className="work-target-head">
        <strong>
          {p.count} of {p.target} {noun} days
        </strong>
        <span className={`small${p.met ? '' : p.needsApproval || p.overExtended ? ' work-over' : ' muted'}`}>{note}</span>
      </div>
      <div className="work-bar" role="progressbar" aria-valuemin={0} aria-valuemax={p.target} aria-valuenow={Math.min(p.count, p.target)}>
        <span className={p.met ? '' : p.needsApproval || p.overExtended ? 'over' : 'short'} style={{ width: `${Math.min(100, (p.count / Math.max(1, p.target)) * 100)}%` }} />
      </div>
      <p className="small muted work-counts">
        Office {summary.office} · Home {summary.home}
        {summary.off > 0 && ` · Off ${summary.off}`}
      </p>
    </section>
  );
}
