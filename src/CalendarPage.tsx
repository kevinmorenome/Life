import { Fragment, useMemo, type ReactNode } from 'react';
import { DayWidget } from './DayWidget';
import { CheckIcon, EyeOffIcon, SuitcaseIcon } from './icons';
import { flagEmoji } from './modules/countries/flag';
import { tripCountry } from './modules/countries/countries';
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
import { pendingOnDate, confirmedStay } from './modules/trips/pendingTrips';
import { hiddenSwarmTrips, newSwarmTrips } from './modules/trips/swarmTrips';
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
  const { settings, update } = useSettings();
  const { homeOn, placeOn, awayOf } = useHomeOn(checkins.items);
  // Time abroad that isn't one of your trips is drawn like one (a line and the flag), from your check-ins.
  // A suggestion you hid on the Trips page (not a trip) is not drawn either.
  const drawnTrips = useMemo(() => {
    const hidden = hiddenSwarmTrips(checkins.items, trips.items, settings.swarmTripsDismissed ?? [], today(), new Date().toISOString(), homeOn, awayOf);
    const stays = abroadStays(checkins.items, homeOn, 3, awayOf);
    return calendarTrips(trips.items, withoutHidden(stays, hidden));
  }, [trips.items, checkins.items, homeOn, awayOf, settings.swarmTripsDismissed]);

  // Trips Swarm suggests, to confirm here as well as on the Trips page.
  const suggestions = useMemo(
    () => newSwarmTrips(checkins.items, trips.items, settings.swarmTripsDismissed ?? [], today(), new Date().toISOString(), homeOn, awayOf),
    [checkins.items, trips.items, settings.swarmTripsDismissed, homeOn, awayOf],
  );

  const dayCountries = useMemo(() => checkinCountriesByDay(checkins.items, (c) => !!placeOn(c.date).city && awayOf(c) === 'home'), [checkins.items, placeOn, awayOf]);

  if (first && DATE.test(first)) {
    const sections: ReactNode[] = layers.map((l, i) => <Fragment key={i}>{l.daySection?.(first)}</Fragment>);
    const pending = pendingOnDate(first, suggestions, drawnTrips);
    if (pending.length)
      sections.unshift(
        <DayWidget key="trip-confirm" id="trip-confirm" title="Trip to confirm" icon={<SuitcaseIcon />} tone="trip" size="full" badge={pending.length > 1 ? pending.length : undefined} summary={pending.map((t) => t.name).join(', ')}>
          <p className="muted small">From your check-ins. Is this a trip?</p>
          <ul className="widget-list">
            {pending.map((t) => (
              <li key={t.id} className="trip-pending-row">
                <span>
                  {flagEmoji(tripCountry(t)) ?? '🧳'} <strong>{t.name}</strong>
                  <span className="muted small"> {t.startDate === t.endDate ? t.startDate : `${t.startDate} → ${t.endDate}`}</span>
                </span>
                <span className="trip-pending-actions">
                  <button type="button" className="icon-btn" aria-label={`Confirm ${t.name} as a trip`} onClick={() => void trips.save(t.swarmRef ? t : confirmedStay(t, new Date().toISOString()))}>
                    <CheckIcon />
                  </button>
                  {t.swarmRef && (
                    <button type="button" className="icon-btn" aria-label={`Not a trip: hide ${t.name}`} onClick={() => void update({ swarmTripsDismissed: [...(settings.swarmTripsDismissed ?? []), t.swarmRef!] })}>
                      <EyeOffIcon />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </DayWidget>,
      );
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
