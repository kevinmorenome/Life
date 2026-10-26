import type { Category, ClothingItem } from './types';

/** Where a piece goes on an outfit "flat lay", from head to feet. */
export type Zone = 'upper' | 'lower' | 'feet' | 'extra';

const ZONE: Record<Category, Zone> = {
  tops: 'upper',
  outerwear: 'upper',
  dresses: 'upper',
  bottoms: 'lower',
  shoes: 'feet',
  accessories: 'extra',
  bags: 'extra',
  jewelry: 'extra',
  swimwear: 'extra',
  activewear: 'extra',
  sleepwear: 'extra',
  underwear: 'extra',
  other: 'extra',
};

/** Max pieces drawn per zone; the rest count toward a "+N" badge. */
const LIMIT: Record<Zone, number> = { upper: 3, lower: 2, feet: 2, extra: 2 };

export interface Board {
  upper: ClothingItem[];
  lower: ClothingItem[];
  feet: ClothingItem[];
  extra: ClothingItem[];
  hidden: number;
}

/** Categories that are add-ons, never a main garment. */
const ADD_ONS: Category[] = ['accessories', 'bags', 'jewelry'];

const LOWER_WORDS = /short|pant|trouser|bottom|jogger|legging|skirt|jean/i;
const UPPER_WORDS = /shirt|\btop|\btee\b|hoodie|jumper|sweater|bra\b/i;

/** Activewear, sleepwear and the like can be worn on top or bottom; guess from the name. */
function zoneOf(p: ClothingItem): Zone {
  const zone = ZONE[p.category];
  if (zone !== 'extra' || ADD_ONS.includes(p.category)) return zone;
  if (LOWER_WORDS.test(p.name)) return 'lower';
  if (UPPER_WORDS.test(p.name)) return 'upper';
  return 'extra';
}

export function boardLayout(pieces: ClothingItem[]): Board {
  const board: Board = { upper: [], lower: [], feet: [], extra: [], hidden: 0 };
  // Outerwear first so it sits on the left, like a jacket over a shirt.
  const ordered = [...pieces].sort((a, b) => Number(b.category === 'outerwear') - Number(a.category === 'outerwear'));
  const zones = new Map(ordered.map((p) => [p, zoneOf(p)]));
  // An outfit with nothing for the legs: the first unplaced non-accessory goes there.
  if (![...zones.values()].includes('lower')) {
    const filler = ordered.find((p) => zones.get(p) === 'extra' && !ADD_ONS.includes(p.category));
    if (filler) zones.set(filler, 'lower');
  }
  for (const p of ordered) {
    const zone = zones.get(p)!;
    if (board[zone].length < LIMIT[zone]) board[zone].push(p);
    else board.hidden++;
  }
  return board;
}
