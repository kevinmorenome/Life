import { useCollection } from '../../lib/useCollection';
import { CalendarView } from './CalendarView';
import { ClothesList } from './ClothesList';
import { ClothesStatsView } from './ClothesStats';
import { DayView } from './DayView';
import { ItemDetail } from './ItemDetail';
import { ItemForm } from './ItemForm';
import { LogItemsPicker, LogOutfitPicker } from './LogWearPickers';
import { OutfitDetail } from './OutfitDetail';
import { OutfitForm } from './OutfitForm';
import { OutfitList } from './OutfitList';
import type { ClothingItem, Outfit } from './types';

export function ClothesRoot({ subroute }: { subroute: string[] }) {
  const clothes = useCollection<ClothingItem>('clothes');
  const outfits = useCollection<Outfit>('outfits');
  const { items, save } = clothes;
  const [first, second, third] = subroute;

  if (clothes.loading || outfits.loading) return <p className="muted">Loading…</p>;

  if (first === 'outfits') {
    const outfitProps = { items, onSaveOutfit: outfits.save, onSaveItem: save };
    if (!second) return <OutfitList outfits={outfits.items} {...outfitProps} />;
    if (second === 'new') return <OutfitForm items={items} onSave={outfits.save} />;
    const outfit = outfits.items.find((o) => o.id === second);
    if (!outfit) return <p className="muted">That outfit doesn’t exist anymore.</p>;
    if (third === 'edit') return <OutfitForm existing={outfit} items={items} onSave={outfits.save} />;
    return <OutfitDetail outfit={outfit} onDelete={outfits.remove} {...outfitProps} />;
  }

  if (first === 'calendar') {
    const props = { items, outfits: outfits.items, onSaveItem: save, onSaveOutfit: outfits.save };
    if (second && /^\d{4}-\d{2}-\d{2}$/.test(second)) {
      if (third === 'outfit') return <LogOutfitPicker date={second} {...props} />;
      if (third === 'items') return <LogItemsPicker date={second} {...props} />;
      return <DayView date={second} {...props} />;
    }
    const month = second && /^\d{4}-\d{2}$/.test(second) ? second : undefined;
    return <CalendarView month={month} items={items} outfits={outfits.items} />;
  }

  if (first === 'new') return <ItemForm onSave={save} />;
  if (first === 'stats') return <ClothesStatsView items={items} />;
  if (first) {
    const item = items.find((i) => i.id === first);
    if (!item) return <p className="muted">That item doesn’t exist anymore.</p>;
    if (second === 'edit') return <ItemForm existing={item} onSave={save} />;
    return <ItemDetail item={item} outfits={outfits.items} onSave={save} onDelete={clothes.remove} />;
  }
  return <ClothesList items={items} />;
}
