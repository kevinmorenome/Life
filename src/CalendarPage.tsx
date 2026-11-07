import { Fragment, useMemo, type ReactNode } from 'react';
import { today } from './lib/format';
import { useSettings } from './lib/settings';
import { useCollection } from './lib/useCollection';
import { MODULES } from './modules';
import { CalendarView } from './modules/clothes/CalendarView';
import { ClothesRoot } from './modules/clothes/ClothesRoot';
import type { Outfit, ClothingItem, Plan } from './modules/clothes/types';
import type { Checkin } from './modules/checkins/types';
import { useHomeOn } from './modules/countries/useHomeOn';
import { abroadStays, calendarTrips, withoutHidden } from './modules/trips/abroadStays';
import { checkinCountriesByDay } from './modules/trips/tripLine';
import { hiddenSwarmTrips } from './modules/trips/swarmTrips';
import type { Trip } from './modules/trips/types';
import type { CalendarLayer } from './modules/types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

/** What every module adds to the calendar. MODULES never changes, so the hooks always run in the same order. */
function useCalendarLayers(): CalendarLayer[] {
  return MODULES.flatMap((m) => (m.calendarLayer ? [m.calendarLayer()] : []));
}

/** `#/calendar[/YYYY-MM]` is the month; `#/calendar/YYYY-MM-DD` is a day. */
export function CalendarPage({ subroute }: { subroute: string[] }) {
  const [first] = subroute;
  const layers = useCalendarLayers();
  const clothes = useCollection<ClothingItem>('clothes');
  const outfits = useCollection<Outfit>('outfits');
  const trips = useCollection<Trip>('trips');
  const plans = useCollection<Plan>('plans');
  const checkins = useCollection<Checkin>('checkins');
  const { settings } = useSettings();
  const homeOn = useHomeOn(checkins.items);
  // Time abroad that isn't one of your trips is drawn like one (a line and the flag), from your check-ins.
  // A suggestion you hid on the Trips page (not a trip) is not drawn either.
  const drawnTrips = useMemo(() => {
    const hidden = hiddenSwarmTrips(checkins.items, trips.items, settings.swarmTripsDismissed ?? [], today(), new Date().toISOString(), homeOn);
    const stays = abroadStays(checkins.items, homeOn);
    return calendarTrips(trips.items, withoutHidden(stays, hidden));
  }, [trips.items, checkins.items, homeOn, settings.swarmTripsDismissed]);

  const dayCountries = useMemo(() => checkinCountriesByDay(checkins.items), [checkins.items]);

  if (first && DATE.test(first)) {
    const sections: ReactNode[] = layers.map((l, i) => <Fragment key={i}>{l.daySection?.(first)}</Fragment>);
    return <ClothesRoot subroute={['calendar', first]} dayExtras={sections} />;
  }
  if (clothes.loading || outfits.loading || trips.loading || plans.loading || checkins.loading) return <p className="muted">Loading…</p>;
  return (
    <CalendarView
      month={first && MONTH.test(first) ? first : undefined}
      items={clothes.items}
      outfits={outfits.items}
      trips={drawnTrips}
      dayCountries={dayCountries}
      homeOn={homeOn}
      plans={plans.items}
      layers={layers}
    />
  );
}
