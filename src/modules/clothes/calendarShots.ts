import type { Category, ClothingItem, Outfit } from './types';
import { outfitName, outfitPieces } from './outfits';
import type { DayWear } from './calendar';

/** What defines an outfit in a small picture comes first: the main garment, then the rest. */
const PICTURE_ORDER: Category[] = ['dresses', 'tops', 'outerwear', 'bottoms', 'shoes', 'bags', 'accessories'];

/** Up to four pieces for an outfit's collage, the most telling ones first, only those with a photo when there are enough. */
export function collagePieces<T extends Pick<ClothingItem, 'category' | 'photo' | 'hasPhoto'>>(pieces: T[], max = 4): T[] {
  const rank = (p: T) => {
    const i = PICTURE_ORDER.indexOf(p.category);
    return i < 0 ? PICTURE_ORDER.length : i;
  };
  const sorted = [...pieces].sort((a, b) => rank(a) - rank(b));
  const withPhoto = sorted.filter((p) => !!(p.photo || p.hasPhoto));
  return (withPhoto.length >= Math.min(max, sorted.length) ? withPhoto : sorted).slice(0, max);
}

/** One picture in a day of the outfit-focused calendar. */
export interface Shot {
  key: string;
  name: string;
  pieces: ClothingItem[];
  planned: boolean;
}

/** What a day shows when only outfits are selected: each outfit worn (or planned, when nothing was worn), loose pieces as one. */
export function dayShots(wear: DayWear | undefined, planned: Outfit[] | undefined, items: ClothingItem[]): Shot[] {
  if (wear) {
    const shots: Shot[] = wear.outfits.map((o) => ({ key: `o${o.id}`, name: outfitName(o), pieces: collagePieces(outfitPieces(o, items)), planned: false }));
    if (wear.items.length)
      shots.push({
        key: 'items',
        name: wear.items[0].name + (wear.items.length > 1 ? ` +${wear.items.length - 1}` : ''),
        pieces: collagePieces(wear.items),
        planned: false,
      });
    return shots;
  }
  return (planned ?? []).map((o) => ({ key: `p${o.id}`, name: outfitName(o), pieces: collagePieces(outfitPieces(o, items)), planned: true }));
}
