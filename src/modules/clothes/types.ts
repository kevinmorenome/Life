export const CATEGORIES = [
  'tops',
  'bottoms',
  'dresses',
  'outerwear',
  'shoes',
  'accessories',
  'activewear',
  'sleepwear',
  'underwear',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

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
  brand?: string;
  color?: string;
  size?: string;
  seasons: Season[];
  price?: number;
  /** YYYY-MM-DD */
  purchaseDate?: string;
  status: Status;
  condition?: Condition;
  /** JPEG data URL */
  photo?: string;
  notes?: string;
  tags?: string[];
  /** One YYYY-MM-DD entry per time worn. */
  wears: string[];
  /** Wears counted before tracking started (e.g. imported), without dates. */
  priorWears?: number;
  createdAt: string;
  updatedAt: string;
}

export function label(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
