import { useCollection } from '../../lib/useCollection';
import type { ClothingItem, Outfit } from '../clothes/types';
import { DayOutfitPicker, TripItemsPicker } from './Pickers';
import { TripForm } from './TripForm';
import { TripList } from './TripList';
import { TripView } from './TripView';
import type { Trip } from './types';

export function PackingRoot({ subroute }: { subroute: string[] }) {
  const trips = useCollection<Trip>('trips');
  const clothes = useCollection<ClothingItem>('clothes');
  const outfits = useCollection<Outfit>('outfits');
  const [first, second, third] = subroute;

  if (trips.loading || clothes.loading || outfits.loading) return <p className="muted">Loading…</p>;

  if (first === 'new') return <TripForm onSave={trips.save} />;
  if (first) {
    const trip = trips.items.find((t) => t.id === first);
    if (!trip) return <p className="muted">That trip doesn’t exist anymore.</p>;
    const props = { trip, items: clothes.items, outfits: outfits.items, onSave: trips.save };
    if (second === 'edit') return <TripForm existing={trip} onSave={trips.save} />;
    if (second === 'items') return <TripItemsPicker {...props} />;
    if (second === 'day' && third && /^\d{4}-\d{2}-\d{2}$/.test(third)) return <DayOutfitPicker date={third} {...props} />;
    return <TripView {...props} onDelete={trips.remove} />;
  }
  return <TripList trips={trips.items} items={clothes.items} outfits={outfits.items} />;
}
