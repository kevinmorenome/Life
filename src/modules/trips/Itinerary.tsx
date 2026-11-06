import { useEffect, useState } from 'react';
import { shortDate } from '../../lib/format';
import { TrashIcon, UndoIcon } from '../../icons';
import type { PlanKind, TripitPlan } from '../../../worker/tripitTypes';

const KIND_LABEL: Record<PlanKind, string> = {
  flight: 'Flight',
  lodging: 'Stay',
  transit: 'Transit',
  car: 'Car',
  meal: 'Meal',
  activity: 'Activity',
  other: 'Plan',
};

/**
 * What TripIt has for the days of a trip, day by day. A plan that spans days is listed on each. A plan that is wrong
 * (or one you never did) can be removed: it then counts for nothing, anywhere, and can be restored from the end of the list.
 */
export function Itinerary({
  plans,
  startDate,
  endDate,
  onRemove,
  onRestore,
}: {
  plans: TripitPlan[];
  startDate: string;
  endDate: string;
  onRemove?: (p: TripitPlan) => Promise<void> | void;
  onRestore?: (p: TripitPlan) => Promise<void> | void;
}) {
  const [toast, setToast] = useState<TripitPlan | null>(null);
  // The Undo toast goes away by itself.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const shown = plans.filter((p) => !p.removed);
  const removed = plans.filter((p) => p.removed);
  if (plans.length === 0) {
    return <p className="muted">Nothing from TripIt for these days yet. Connect TripIt in Settings, or add plans in TripIt and fetch again.</p>;
  }
  const days = [...new Set(shown.flatMap((p) => daysOf(p, startDate, endDate)))].sort();
  return (
    <section className="itinerary">
      {days.length === 0 && <p className="muted">Every plan of this trip is removed.</p>}
      {days.map((day) => (
        <div key={day} className="pack-group">
          <h3>{shortDate(day)}</h3>
          <ul className="pack-list">
            {shown
              .filter((p) => p.start <= day && p.end >= day)
              .map((p) => (
                <li key={p.id} className="pack-row">
                  <span className="pack-text">
                    <strong>{p.title}</strong>
                    <span className="muted small">
                      {[KIND_LABEL[p.kind], p.start === day && p.startTime ? p.startTime : p.start < day ? 'continues' : '', p.location].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {onRemove && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove ${p.title} from this trip`}
                      title="Remove"
                      onClick={async () => {
                        await onRemove(p);
                        setToast(p);
                      }}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
      {removed.length > 0 && onRestore && (
        <details>
          <summary className="small">Removed ({removed.length})</summary>
          <ul className="pack-list">
            {removed.map((p) => (
              <li key={p.id} className="pack-row">
                <span className="pack-text">
                  <strong>{p.title}</strong>
                  <span className="muted small">{[shortDate(p.start), p.location].filter(Boolean).join(' · ')}</span>
                </span>
                <button type="button" className="icon-btn" aria-label={`Restore ${p.title}`} title="Restore" onClick={() => void onRestore(p)}>
                  <UndoIcon />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {toast && onRestore && (
        <div className="food-toast" role="status">
          <span>Removed {toast.title}</span>
          <button
            type="button"
            onClick={async () => {
              await onRestore(toast);
              setToast(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </section>
  );
}

/** The days of a plan inside the trip. */
function daysOf(p: TripitPlan, from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${p.start < from ? from : p.start}T00:00:00Z`);
  const last = p.end > to ? to : p.end;
  for (let i = 0; i < 400 && d.toISOString().slice(0, 10) <= last; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
