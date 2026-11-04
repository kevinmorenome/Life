import type { Category, ClothingItem } from './types';

/** The garments that tell an outfit apart come first in its small picture. */
const ORDER: Category[] = ['dresses', 'tops', 'outerwear', 'bottoms', 'shoes', 'bags', 'accessories'];

/** Up to `max` pieces for an outfit's collage: main garments first, and only ones with a photo while there are enough of those. */
export function collagePieces<T extends Pick<ClothingItem, 'category' | 'photo' | 'hasPhoto'>>(pieces: T[], max = 4): T[] {
  const rank = (p: T) => {
    const i = ORDER.indexOf(p.category);
    return i < 0 ? ORDER.length : i;
  };
  const sorted = [...pieces].sort((a, b) => rank(a) - rank(b));
  const pictured = sorted.filter((p) => p.photo || p.hasPhoto);
  return (pictured.length >= Math.min(max, sorted.length) ? pictured : sorted).slice(0, max);
}
