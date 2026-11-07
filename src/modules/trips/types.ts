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
  /** Where the trip went, as an ISO 3166-1 alpha-2 code ("HR"). Counts towards Stats → Places → Countries once the trip has started. */
  country?: string;
  /** Cover picture: a small JPEG data URL (see `resizeImage`). */
  photo?: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD, inclusive */
  endDate: string;
  /**
   * Legacy: outfit ids planned for each YYYY-MM-DD of the trip, from before trips used the calendar's own plans.
   * New trips don't set it; `migrateTripPlans()` turns what is there into plans and empties it.
   */
  outfitPlan?: Record<string, string[]>;
  /** Closet items added by hand, on top of those from planned outfits. */
  itemIds: string[];
  extras: PackExtra[];
  /** Ids (closet item or extra) already in the bag. */
  packed: string[];
  /** Set on trips made from TripIt: the id of the earliest plan in the group. Sync never touches a trip that has one. */
  tripitRef?: string;
  /** Set on trips made from Swarm check-ins abroad: the id of the first check-in. Sync never touches a trip that has one. */
  swarmRef?: string;
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
