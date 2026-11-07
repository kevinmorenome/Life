import { useMemo } from 'react';
import { shortDate } from '../../lib/format';
import { UndoIcon } from '../../icons';
import type { TripitPlan } from '../../../worker/tripitTypes';
import type { Checkin } from '../checkins/types';
import { itineraryCheckins, matchKey } from './itineraryCheckins';
import { usePlaceUi } from './PlaceUi';
import type { PlaceRef } from './placeActions';

/**
 * What TripIt has for the days of a trip, day by day, with your Swarm check-ins of those days (a check-in that is the
 * same place as a plan is shown on that plan, not twice). A plan that spans days is listed on each. Tap a place to change,
 * merge or remove it (see PlaceUi): a plan that is wrong (or one you never did) can be removed, it then counts for nothing,
 * anywhere, and can be restored from the end of the list.
 */
export function Itinerary({ plans, checkins = [], startDate, endDate }: { plans: TripitPlan[]; checkins?: Checkin[]; startDate: string; endDate: string }) {
  const shown = useMemo(() => plans.filter((p) => !p.removed), [plans]);
  const removed = plans.filter((p) => p.removed);
  // The rows of each day: the plans, each with its check-in folded in, then the other check-ins.
  const dayRows = useMemo(() => {
    const { extra, matched } = itineraryCheckins(shown, checkins, startDate, endDate);
    const days = [...new Set([...shown.flatMap((p) => daysOf(p, startDate, endDate)), ...extra.keys()])].sort();
    const rows = new Map<string, PlaceRef[]>();
    for (const day of days) {
      rows.set(day, [
        ...shown.filter((p) => p.start <= day && p.end >= day).map((p): PlaceRef => ({ kind: 'plan', day, plan: p, here: matched.get(matchKey(p, day)) })),
        ...(extra.get(day) ?? []).map((c): PlaceRef => ({ kind: 'checkin', day, checkin: c })),
      ]);
    }
    return rows;
  }, [shown, checkins, startDate, endDate]);
  const ui = usePlaceUi(dayRows);

  if (plans.length === 0 && dayRows.size === 0) {
    return <p className="muted">Nothing from TripIt for these days yet. Connect TripIt in Settings, or add plans in TripIt and fetch again.</p>;
  }
  return (
    <section className="itinerary">
      {dayRows.size === 0 && <p className="muted">Every plan of this trip is removed.</p>}
      {ui.bar}
      {[...dayRows].map(([day, rows]) => (
        <div key={day} className="pack-group">
          <h3>{shortDate(day)}</h3>
          <ul className="pack-list">{rows.map((r) => ui.row(r))}</ul>
        </div>
      ))}
      {removed.length > 0 && (
        <details>
          <summary className="small">Removed ({removed.length})</summary>
          <ul className="pack-list">
            {removed.map((p) => (
              <li key={p.id} className="pack-row">
                <span className="pack-text">
                  <strong>{p.title}</strong>
                  <span className="muted small">{[shortDate(p.start), p.location].filter(Boolean).join(' · ')}</span>
                </span>
                <button type="button" className="icon-btn" aria-label={`Restore ${p.title}`} title="Restore" onClick={() => void ui.edits.restorePlan(p)}>
                  <UndoIcon />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {ui.sheet}
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
