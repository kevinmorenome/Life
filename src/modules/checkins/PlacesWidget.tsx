import { useMemo } from 'react';
import { DayWidget } from '../../DayWidget';
import { PinIcon } from '../../icons';
import type { TripitPlan } from '../../../worker/tripitTypes';
import { itineraryCheckins, matchKey } from '../trips/itineraryCheckins';
import { usePlaceUi } from '../trips/PlaceUi';
import type { PlaceRef } from '../trips/placeActions';
import type { Checkin } from './types';

/**
 * The day screen's Places widget, built exactly like a day of the trip's Itinerary (same rows, same folding, same sheet):
 * the TripIt plans of the day, each with the Swarm check-in of the same place folded in, then the other Swarm check-ins.
 * Nothing but the places shows until you tap one (see PlaceUi).
 */
export function PlacesWidget({ date, done, plans }: { date: string; done: Checkin[]; plans: TripitPlan[] }) {
  const rows = useMemo(() => {
    const dayPlans = plans
      .filter((p) => !p.removed && p.start <= date && p.end >= date)
      .sort((a, b) => a.start.localeCompare(b.start) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.id.localeCompare(b.id));
    const { extra, matched } = itineraryCheckins(dayPlans, done, date, date);
    return [
      ...dayPlans.map((p): PlaceRef => ({ kind: 'plan', day: date, plan: p, here: matched.get(matchKey(p, date)) })),
      ...(extra.get(date) ?? []).map((c): PlaceRef => ({ kind: 'checkin', day: date, checkin: c })),
    ];
  }, [plans, done, date]);
  const dayRows = useMemo(() => new Map([[date, rows]]), [date, rows]);
  const ui = usePlaceUi(dayRows);
  const names = rows.map((r) => (r.kind === 'plan' ? r.plan.title : r.checkin.venue));

  return (
    <DayWidget id="places" title="Places" icon={<PinIcon />} tone="place" size="full" badge={rows.length > 1 ? rows.length : undefined} summary={names.join(', ')}>
      {ui.bar}
      <ul className="widget-list">{rows.map((r) => ui.row(r))}</ul>
      {ui.sheet}
    </DayWidget>
  );
}
