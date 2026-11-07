/** A Swarm check-in, pulled by the Worker (never edited in the app). id = `swarm-<check-in id>`. */
export interface Checkin {
  id: string;
  venueId?: string;
  venue: string;
  category?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  shout?: string;
  /** YYYY-MM-DD and HH:MM, local to where you were. */
  date: string;
  time: string;
  /** Epoch seconds. */
  at: number;
  source: 'swarm';
  createdAt: string;
  updatedAt: string;
}
