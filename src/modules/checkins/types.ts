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
  /** A Swarm check-in you merged with a TripIt plan by hand (the plan's id), or `NO_PLAN` to keep it apart from the plan its name matches. */
  planRef?: string;
  createdAt: string;
  updatedAt: string;
}

/** `Checkin.planRef` value for a check-in that must not be folded into a plan, whatever its name. */
export const NO_PLAN = 'none';
