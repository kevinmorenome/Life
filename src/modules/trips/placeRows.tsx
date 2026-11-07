import type { PlanKind, TripitPlan } from '../../../worker/tripitTypes';
import type { Checkin } from '../checkins/types';
import { SourceLogos } from '../checkins/SourceLogo';

export const KIND_LABEL: Record<PlanKind, string> = {
  flight: 'Flight',
  lodging: 'Stay',
  transit: 'Transit',
  car: 'Car',
  meal: 'Meal',
  activity: 'Activity',
  other: 'Plan',
};

/** Local time now as HH:MM. */
export const nowTime = (d = new Date()): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Whether a plan on `day` hasn't happened yet: a later day, or later today than its planned time. A plan you checked in at
 * has happened, and one with no planned time counts as happening all day.
 */
export function isUpcoming(plan: Pick<TripitPlan, 'start' | 'startTime'>, day: string, here: unknown, today: string, now: string): boolean {
  if (here) return false;
  if (day > today) return true;
  return day === today && plan.start === day && !!plan.startTime && plan.startTime > now;
}

/**
 * The text of a TripIt plan on one day, the same in the trip's Itinerary and on the day screen. A plan you also checked in
 * at keeps both times (when it was planned, when you were there) and shows both logos.
 */
export function PlanText({ plan, day, here }: { plan: TripitPlan; day: string; here?: Checkin }) {
  const planTime = plan.start === day && plan.startTime ? plan.startTime : '';
  const times = here ? [planTime && `planned ${planTime}`, here.time && `checked in ${here.time}`] : [planTime];
  return (
    <>
      <strong>{plan.title}</strong>
      <span className="muted small">
        {[KIND_LABEL[plan.kind], ...times, !planTime && plan.start < day ? 'continues' : '', plan.location].filter(Boolean).join(' · ')}{' '}
        <SourceLogos sources={here ? ['tripit', 'swarm'] : ['tripit']} />
      </span>
    </>
  );
}

/** The text of a Swarm check-in that isn't part of a plan, the same in the Itinerary and on the day screen. */
export function CheckinText({ checkin, shout = false }: { checkin: Checkin; shout?: boolean }) {
  return (
    <>
      <strong>{checkin.venue}</strong>
      <span className="muted small">
        {[checkin.time, checkin.category, checkin.city].filter(Boolean).join(' · ')} <SourceLogos sources={['swarm']} />
      </span>
      {shout && checkin.shout && <span className="small">{checkin.shout}</span>}
    </>
  );
}
