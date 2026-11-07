import { useMemo } from 'react';
import { syncPlanCheckins } from './planCheckinsRunner';
import { today } from '../../lib/format';
import { useSettings } from '../../lib/settings';
import { useCollection } from '../../lib/useCollection';
import type { TripitPlan } from '../../../worker/tripitTypes';
import type { ClothingItem, Outfit, Plan } from '../clothes/types';
import { DayOutfitPicker, TripItemsPicker } from './Pickers';
import { TripForm } from './TripForm';
import type { Checkin } from '../checkins/types';
import { useHomeOn } from '../countries/useHomeOn';
import { hiddenSwarmTrips, newSwarmTrips } from './swarmTrips';
import { TripList } from './TripList';
import { TripView, type TripTab } from './TripView';
import type { Trip } from './types';

export function TripsRoot({ subroute }: { subroute: string[] }) {
  const trips = useCollection<Trip>('trips');
  const clothes = useCollection<ClothingItem>('clothes');
  const outfits = useCollection<Outfit>('outfits');
  const tripitPlans = useCollection<TripitPlan>('tripitplans');
  const plans = useCollection<Plan>('plans');
  const { settings, update } = useSettings();
  const checkins = useCollection<Checkin>('checkins');
  const { homeOn, awayOf } = useHomeOn(checkins.items);
  const [first, second, third] = subroute;
  const hidden = useMemo(
    () => hiddenSwarmTrips(checkins.items, trips.items, settings.swarmTripsDismissed ?? [], today(), new Date().toISOString(), homeOn, awayOf),
    [checkins.items, trips.items, settings.swarmTripsDismissed, homeOn, awayOf],
  );
  // Trips Swarm suggests (see swarmTrips.ts): nothing is made until you add one.
  const suggestions = useMemo(
    () => newSwarmTrips(checkins.items, trips.items, settings.swarmTripsDismissed ?? [], today(), new Date().toISOString(), homeOn, awayOf),
    [checkins.items, trips.items, settings.swarmTripsDismissed, homeOn, awayOf],
  );

  if (trips.loading || clothes.loading || outfits.loading || tripitPlans.loading || plans.loading || checkins.loading) return <p className="muted">Loading…</p>;

  if (first === 'new') return <TripForm onSave={trips.save} />;
  if (first) {
    const trip = trips.items.find((t) => t.id === first);
    if (!trip) return <p className="muted">That trip doesn’t exist anymore.</p>;
    // A trip made from TripIt or Swarm that you delete is remembered, so the next fetch doesn't make it again.
    const onDelete = async (id: string) => {
      if (trip.tripitRef) await update({ tripitDismissed: [...(settings.tripitDismissed ?? []), trip.tripitRef] });
      if (trip.swarmRef) await update({ swarmTripsDismissed: [...(settings.swarmTripsDismissed ?? []), trip.swarmRef] });
      await trips.remove(id);
    };
    const props = { trip, items: clothes.items, outfits: outfits.items, plans: plans.items, onSave: trips.save };
    const planProps = { onSavePlan: plans.save, onRemovePlan: plans.remove };
    if (second === 'edit') return <TripForm existing={trip} onSave={trips.save} />;
    if (second === 'items') return <TripItemsPicker {...props} />;
    if (second === 'day' && third && /^\d{4}-\d{2}-\d{2}$/.test(third)) return <DayOutfitPicker date={third} {...props} {...planProps} />;
    const tab: TripTab =
      second === 'outfits' || second === 'other' || second === 'itinerary' ? second : 'clothes';
    return <TripView {...props} tab={tab} tripitPlans={tripitPlans.items} onSavePlan={async (p) => {
          await tripitPlans.save(p);
          await syncPlanCheckins();
        }} onDelete={onDelete} />;
  }
  return (
    <TripList
      trips={trips.items}
      items={clothes.items}
      outfits={outfits.items}
      plans={plans.items}
      suggestions={suggestions}
      hidden={hidden}
      onAddSuggestion={trips.save}
      onDismissSuggestion={(t) => update({ swarmTripsDismissed: [...(settings.swarmTripsDismissed ?? []), t.swarmRef!] })}
      onRestoreSuggestion={(t) => update({ swarmTripsDismissed: (settings.swarmTripsDismissed ?? []).filter((r) => r !== t.swarmRef) })}
    />
  );
}
