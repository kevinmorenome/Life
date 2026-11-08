import { useMemo } from 'react';
import { PinIcon } from '../../icons';
import { useCollection } from '../../lib/useCollection';
import type { TripitPlan } from '../../../worker/tripitTypes';
import type { CalendarLayer } from '../types';
import { byDate, dayLabel } from './checkins';
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
      if (!done.length && !hasPlans) return null;
      return <PlacesWidget date={date} done={done} plans={plans} />;
    },
  };
}
