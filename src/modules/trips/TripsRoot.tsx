import { useSettings } from '../../lib/settings';
import { useCollection } from '../../lib/useCollection';
import type { TripitPlan } from '../../../worker/tripitTypes';
import type { ClothingItem, Outfit, Plan } from '../clothes/types';
import { DayOutfitPicker, TripItemsPicker } from './Pickers';
import { TripForm } from './TripForm';
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
  const [first, second, third] = subroute;

  if (trips.loading || clothes.loading || outfits.loading || tripitPlans.loading || plans.loading) return <p className="muted">Loading…</p>;

  if (first === 'new') return <TripForm onSave={trips.save} />;
  if (first) {
    const trip = trips.items.find((t) => t.id === first);
    if (!trip) return <p className="muted">That trip doesn’t exist anymore.</p>;
    // A trip made from TripIt that you delete is remembered, so the next fetch doesn't make it again.
    const onDelete = async (id: string) => {
      if (trip.tripitRef) await update({ tripitDismissed: [...(settings.tripitDismissed ?? []), trip.tripitRef] });
      await trips.remove(id);
    };
    const props = { trip, items: clothes.items, outfits: outfits.items, plans: plans.items, onSave: trips.save };
    const planProps = { onSavePlan: plans.save, onRemovePlan: plans.remove };
    if (second === 'edit') return <TripForm existing={trip} onSave={trips.save} />;
    if (second === 'items') return <TripItemsPicker {...props} />;
    if (second === 'day' && third && /^\d{4}-\d{2}-\d{2}$/.test(third)) return <DayOutfitPicker date={third} {...props} {...planProps} />;
    const tab: TripTab =
      second === 'outfits' || second === 'other' || second === 'itinerary' ? second : 'clothes';
    return <TripView {...props} tab={tab} tripitPlans={tripitPlans.items} onDelete={onDelete} />;
  }
  return <TripList trips={trips.items} items={clothes.items} outfits={outfits.items} plans={plans.items} />;
}
