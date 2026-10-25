/** A non-clothing thing to pack (passport, charger…). */
export interface PackExtra {
  id: string;
  label: string;
  /** Heading it's listed under, e.g. "Toiletries". */
  group: string;
}

export interface Trip {
  id: string;
  name: string;
  destination?: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD, inclusive */
  endDate: string;
  /** Outfit ids planned for each YYYY-MM-DD of the trip. */
  outfitPlan: Record<string, string[]>;
  /** Closet items added by hand, on top of those from planned outfits. */
  itemIds: string[];
  extras: PackExtra[];
  /** Ids (closet item or extra) already in the bag. */
  packed: string[];
  createdAt: string;
  updatedAt: string;
}

export const EXTRA_GROUPS = ['Documents', 'Toiletries', 'Tech', 'Health', 'Other'] as const;

/** One-tap suggestions for the "Other things" checklist. */
export const SUGGESTED_EXTRAS: Record<string, string[]> = {
  Documents: ['Passport / ID', 'Tickets', 'Wallet', 'Keys'],
  Toiletries: ['Toothbrush', 'Deodorant', 'Skincare', 'Hairbrush'],
  Tech: ['Phone charger', 'Headphones', 'Power bank', 'Adapter'],
  Health: ['Medication', 'Sunscreen', 'Glasses / lenses'],
};
