/**
 * One Wolt delivery order, read by Claude from the receipt email in Gmail (item lines are only in the
 * PDF attachment, so they are not tracked). id = `wolt-<sourceId>`; never edited from the tools.
 */
export interface WoltOrder {
  id: string;
  /** Venue as Wolt names it, e.g. "McDonald's - Rotor". */
  restaurant: string;
  /** Local YYYY-MM-DD and HH:MM of the delivery. */
  date: string;
  time?: string;
  /** What was paid, in `currency`. */
  total: number;
  /** ISO code, "EUR" by default. Orders in other currencies stay out of the euro totals. */
  currency: string;
  city?: string;
  createdAt: string;
  updatedAt: string;
}
