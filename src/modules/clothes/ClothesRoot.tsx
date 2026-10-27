import { useCollection } from '../../lib/useCollection';
import { CalendarView } from './CalendarView';
import { ClosetReview } from './ClosetReview';
import { ClothesList } from './ClothesList';
import { ClothesStatsView } from './ClothesStats';
import { DayView } from './DayView';
import { ItemDetail } from './ItemDetail';
import { ItemForm } from './ItemForm';
import { LogItemsPicker, LogOutfitPicker, NewOutfitForDay } from './LogWearPickers';
import { OutfitDetail } from './OutfitDetail';
import { OutfitForm } from './OutfitForm';
import { OutfitList } from './OutfitList';
import { syncPieceWears } from './outfits';
import { TodayView } from './TodayView';
import type { Trip } from '../packing/types';
import type { ClothingItem, Outfit, Plan } from './types';

export function ClothesRoot({ subroute }: { subroute: string[] }) {
  const clothes = useCollection<ClothingItem>('clothes');
  const outfits = useCollection<Outfit>('outfits');
  const trips = useCollection<Trip>('trips');
  const plans = useCollection<Plan>('plans');
  const { items, save } = clothes;
  const [first, second, third] = subroute;

  if (clothes.loading || outfits.loading || trips.loading || plans.loading) return <p className="muted">Loading…</p>;

  if (first === 'outfits') {
    const outfitProps = { items, plans: plans.items, onSavePlan: plans.save, onRemovePlan: plans.remove, onSaveOutfit: outfits.save, onSaveItem: save };
    if (!second) return <OutfitList outfits={outfits.items} items={items} />;
    if (second === 'new') return <OutfitForm initialItemIds={third ? [third] : undefined} items={items} onSave={outfits.save} />;
    const outfit = outfits.items.find((o) => o.id === second);
    if (!outfit) return <p className="muted">That outfit doesn’t exist anymore.</p>;
    if (third === 'edit') {
      const saveEdited = async (o: Outfit) => {
        await outfits.save(o);
        for (const piece of syncPieceWears(outfit, o, items, outfits.items)) await save(piece);
      };
      return <OutfitForm existing={outfit} items={items} onSave={saveEdited} />;
    }
    return <OutfitDetail outfit={outfit} onDelete={outfits.remove} {...outfitProps} />;
  }

  if (first === 'calendar') {
    const props = { items, outfits: outfits.items, trips: trips.items, plans: plans.items, onSavePlan: plans.save, onRemovePlan: plans.remove, onSaveItem: save, onSaveOutfit: outfits.save };
    if (second && /^\d{4}-\d{2}-\d{2}$/.test(second)) {
      if (third === 'outfit') return <LogOutfitPicker date={second} {...props} />;
      if (third === 'new-outfit') return <NewOutfitForDay date={second} {...props} />;
      if (third === 'items') return <LogItemsPicker date={second} {...props} />;
      return <DayView date={second} {...props} />;
    }
    const month = second && /^\d{4}-\d{2}$/.test(second) ? second : undefined;
    return <CalendarView month={month} items={items} outfits={outfits.items} trips={trips.items} plans={plans.items} />;
  }

  if (first === 'today') {
    return <TodayView items={items} outfits={outfits.items} onSaveItem={save} onSaveOutfit={outfits.save} />;
  }

  if (first === 'review') return <ClosetReview step={second} items={items} onSave={save} />;

  if (first === 'new') return <ItemForm onSave={save} />;
  if (first === 'stats') return <ClothesStatsView items={items} />;
  if (first) {
    const item = items.find((i) => i.id === first);
    if (!item) return <p className="muted">That item doesn’t exist anymore.</p>;
    if (second === 'edit') return <ItemForm existing={item} onSave={save} />;
    return <ItemDetail item={item} items={items} outfits={outfits.items} onSave={save} onDelete={clothes.remove} />;
  }
  return <ClothesList items={items} onSave={save} />;
}
