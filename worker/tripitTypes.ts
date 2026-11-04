// Shared with the app (type-only, so it must not import anything that needs the Worker's types).

export type PlanKind = 'flight' | 'lodging' | 'transit' | 'car' | 'meal' | 'activity' | 'other';

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
}
