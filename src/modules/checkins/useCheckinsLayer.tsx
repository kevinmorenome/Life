import { useMemo } from 'react';
import { PinIcon } from '../../icons';
import { today } from '../../lib/format';
import { useCollection } from '../../lib/useCollection';
import type { TripitPlan } from '../../../worker/tripitTypes';
import { plannedOnDay } from '../trips/planCheckins';
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
      const planned = plannedOnDay(plans, items, date, today());
      if (!done.length && !planned.length) return null;
      return <PlacesWidget date={date} done={done} planned={planned} />;
    },
  };
}
