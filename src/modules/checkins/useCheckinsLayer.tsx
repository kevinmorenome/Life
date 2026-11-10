import { useMemo } from 'react';
import { PinIcon } from '../../icons';
import { useCollection } from '../../lib/useCollection';
import type { TripitPlan } from '../../../worker/tripitTypes';
import type { CalendarLayer } from '../types';
import { byDate, dayLabel } from './checkins';
import { OnThisDayWidget } from './OnThisDayWidget';
import { onThisDay } from './onThisDay';
import { PlacesWidget } from './PlacesWidget';
import type { Checkin } from './types';

/** Swarm check-ins on the shared calendar: a mark on each day and the list on the day screen. */
export function useCheckinsCalendarLayer(): CalendarLayer {
  const { items } = useCollection<Checkin>('checkins');
  const plans = useCollection<TripitPlan>('tripitplans').items;
  const days = useMemo(() => byDate(items), [items]);

  return {
    earliest: days.size ? [...days.keys()].sort()[0] : undefined,
    mark(date) {
      const list = days.get(date);
      if (!list) return null;
      return { tone: 'place', icon: <PinIcon />, label: dayLabel(list), tiles: list.map((c) => c.venue) };
    },
    daySection(date) {
      const done = days.get(date) ?? [];
      // The same TripIt plans and check-ins the trip's Itinerary lists, folded the same way.
      const hasPlans = plans.some((p) => !p.removed && p.start <= date && p.end >= date);
      const before = onThisDay(items, date);
      if (!done.length && !hasPlans && !before.length) return null;
      return (
        <>
          {(done.length > 0 || hasPlans) && <PlacesWidget date={date} done={done} plans={plans} />}
          {before.length > 0 && <OnThisDayWidget date={date} years={before} />}
        </>
      );
    },
  };
}
