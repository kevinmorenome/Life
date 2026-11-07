export type RideProvider = 'bolt' | 'uber';

/**
 * One Bolt or Uber ride, read by Claude from the receipt email in Gmail (`add_rides`).
 * id = `ride-<provider>-<sourceId>`; never edited from the tools.
 */
export interface Ride {
  id: string;
  provider: RideProvider;
  /** Local YYYY-MM-DD and HH:MM the ride started (the email's pickup time, not when it was sent). */
  date: string;
  time?: string;
  /** Addresses or place names as the receipt prints them. */
  from?: string;
  to?: string;
  /** What was paid in `currency`, tip included. */
  fare: number;
  /** ISO code, "EUR" by default. Rides in other currencies stay out of the euro totals. */
  currency: string;
  distanceKm?: number;
  durationMin?: number;
  city?: string;
  createdAt: string;
  updatedAt: string;
}
