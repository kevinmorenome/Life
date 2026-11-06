// Shared with the app (type-only, so it must not import anything that needs the Worker's types).

export type PlanKind = 'flight' | 'lodging' | 'transit' | 'car' | 'meal' | 'activity' | 'other';

/** A place you were on a given day, from a plan: a country (ISO alpha-2) and the day. It counts like a check-in. */
export interface PlanStop {
  country: string;
  /** YYYY-MM-DD */
  date: string;
}

/** What the app stores per TripIt event. */
export interface TripitPlan {
  /** `tripit-<uid>`, so an event is never stored twice. */
  id: string;
  kind: PlanKind;
  title: string;
  /** YYYY-MM-DD, local to the place when the feed says where. */
  start: string;
  /** HH:MM; missing for all-day events. */
  startTime?: string;
  /** YYYY-MM-DD, inclusive. */
  end: string;
  endTime?: string;
  allDay: boolean;
  location?: string;
  /** The trip's name, when the event's text names it ("Trip: Lisbon"). */
  tripName?: string;
  description?: string;
  url?: string;
  /** Where the plan took you, by country and day (a flight: where it left and where it landed). Missing on feed plans. */
  stops?: PlanStop[];
  /** The id of the trip record this plan belongs to, for plans imported with a past trip. */
  tripRef?: string;
}
