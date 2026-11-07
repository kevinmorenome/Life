/**
 * A check-in: a Swarm one pulled by the Worker (id `swarm-<check-in id>`), or one the app made from an itinerary plan
 * (`source: 'plan'`, id `plan-<plan id>[-dep|-arr]`, see trips/planCheckins.ts). Never edited.
 */
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
  source: 'swarm' | 'plan';
  createdAt: string;
  updatedAt: string;
}
