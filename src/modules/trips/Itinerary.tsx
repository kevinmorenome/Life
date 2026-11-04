import { shortDate } from '../../lib/format';
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

/** What TripIt has for the days of a trip, day by day. A plan that spans days is listed on each. */
export function Itinerary({ plans, startDate, endDate }: { plans: TripitPlan[]; startDate: string; endDate: string }) {
  if (plans.length === 0) {
    return <p className="muted">Nothing from TripIt for these days yet. Connect TripIt in Settings, or add plans in TripIt and fetch again.</p>;
  }
  const days = [...new Set(plans.flatMap((p) => daysOf(p, startDate, endDate)))].sort();
  return (
    <section className="itinerary">
      {days.map((day) => (
        <div key={day} className="pack-group">
          <h3>{shortDate(day)}</h3>
          <ul className="pack-list">
            {plans
              .filter((p) => p.start <= day && p.end >= day)
              .map((p) => (
                <li key={p.id} className="pack-row">
                  <span className="pack-text">
                    <strong>{p.title}</strong>
                    <span className="muted small">
                      {[KIND_LABEL[p.kind], p.start === day && p.startTime ? p.startTime : p.start < day ? 'continues' : '', p.location].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
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
