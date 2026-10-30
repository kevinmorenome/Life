export const CATEGORIES = [
  'tops',
  'bottoms',
  'dresses',
  'outerwear',
  'shoes',
  'accessories',
  'bags',
  'jewelry',
  'swimwear',
  'activewear',
  'sleepwear',
  'underwear',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Suggested sub-categories; the field is free text, so anything else is allowed. */
export const SUBCATEGORIES: Record<Category, string[]> = {
  tops: ['T-shirt', 'Shirt', 'Polo shirt', 'Blouse', 'Sweater', 'Hoodie', 'Cardigan', 'Tank top'],
  bottoms: ['Jeans', 'Trousers', 'Shorts', 'Skirt', 'Joggers', 'Leggings'],
  dresses: ['Mini dress', 'Midi dress', 'Maxi dress', 'Jumpsuit'],
  outerwear: ['Jacket', 'Coat', 'Blazer', 'Puffer', 'Raincoat', 'Gilet'],
  shoes: ['Sneakers', 'Boots', 'Sandals', 'Loafers', 'Heels', 'Flats'],
  accessories: ['Hat', 'Cap', 'Beanie', 'Scarf', 'Belt', 'Gloves', 'Sunglasses', 'Watch'],
  bags: ['Backpack', 'Tote', 'Crossbody', 'Clutch', 'Handbag'],
  jewelry: ['Necklace', 'Earrings', 'Ring', 'Bracelet'],
  swimwear: ['Swim trunks', 'Bikini top', 'Bikini bottoms', 'One-piece', 'Cover-up'],
  activewear: ['Sports bra', 'Running shorts', 'Leggings', 'Track jacket'],
  sleepwear: ['Pyjama set', 'Nightgown', 'Robe'],
  underwear: ['Briefs', 'Boxers', 'Socks', 'Bra'],
  other: [],
};

/** "Tops › Polo shirt", or just the category when there is no sub-category. */
export function categoryLabel(item: Pick<ClothingItem, 'category' | 'subcategory'>): string {
  return item.subcategory ? `${label(item.category)} › ${item.subcategory}` : label(item.category);
}

export const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

// Items that leave the closet keep their record so spending history stays accurate.
export const STATUSES = ['active', 'storage', 'donated', 'sold', 'discarded'] as const;
export type Status = (typeof STATUSES)[number];

export const CONDITIONS = ['new', 'good', 'worn', 'damaged'] as const;
export type Condition = (typeof CONDITIONS)[number];

export interface ClothingItem {
  id: string;
  name: string;
  category: Category;
  /** Optional refinement of the category, e.g. "Polo shirt". */
  subcategory?: string;
  brand?: string;
  /** Colour names. Older records only have the free-text `color`; read both via `itemColors()`. */
  colors?: string[];
  /** Comma-joined mirror of `colors`, kept for older records, search and the MCP endpoint. */
  color?: string;
  size?: string;
  seasons: Season[];
  price?: number;
  /** YYYY-MM-DD */
  purchaseDate?: string;
  status: Status;
  /** YYYY-MM-DD the item left the closet (sold, donated, discarded). Unset for older records. */
  retiredDate?: string;
  condition?: Condition;
  /** JPEG data URL */
  photo?: string;
  notes?: string;
  /** Fabric or material, e.g. "Cotton, Elastane". */
  material?: string;
  tags?: string[];
  favorite?: boolean;
  /** Added automatically (e.g. from a receipt email) and not yet checked by the owner. */
  needsReview?: boolean;
  /** Situations it suits, e.g. "work", "date night". */
  occasions?: string[];
  /** One YYYY-MM-DD entry per time worn. */
  wears: string[];
  /** Wears counted before tracking started (e.g. imported), without dates. */
  priorWears?: number;
  createdAt: string;
  updatedAt: string;
}

/** A set of items worn together. */
export interface Outfit {
  id: string;
  /** Optional; the UI falls back to the creation date. */
  name?: string;
  itemIds: string[];
  tags?: string[];
  seasons?: Season[];
  favorite?: boolean;
  /** One YYYY-MM-DD entry per time worn. */
  wears: string[];
  /** Wears counted before tracking started (e.g. imported), without dates. */
  priorWears?: number;
  createdAt: string;
  updatedAt: string;
}

/** An outfit scheduled for a day. Kept apart from `wears` so stats never count it until it's worn. */
export interface Plan {
  /** `${outfitId}_${date}`, so planning the same outfit twice on a day is a no-op. */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  outfitId: string;
  createdAt: string;
  updatedAt: string;
}

export function label(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
