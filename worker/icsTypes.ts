// Shared with the app (type-only).

export interface IcsReport {
  /** Components in the text, e.g. { VCALENDAR: 1, VEVENT: 12 }. */
  components: Record<string, number>;
  events: number;
  usable: number;
  cancelled: number;
  /** Events with no UID, no summary or a start we cannot read. */
  unreadable: number;
  /** Property names of the first event (names and parameter names only, never values), to see the feed's shape. */
  firstEventProps: string[];
}
