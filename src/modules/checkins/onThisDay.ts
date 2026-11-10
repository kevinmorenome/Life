import type { Checkin } from './types';

export interface OnThisDayYear {
  year: string;
  /** The date in that year, YYYY-MM-DD. */
  date: string;
  /** Oldest first. */
  checkins: Checkin[];
}

/**
 * The check-ins made on the same month and day in earlier years, the latest year first. Only years before
 * `date`'s own count, so a day never lists itself. 29 February matches only another 29 February.
 */
export function onThisDay(checkins: Checkin[], date: string): OnThisDayYear[] {
  const monthDay = date.slice(5);
  const year = date.slice(0, 4);
  const years = new Map<string, Checkin[]>();
  for (const c of checkins) {
    if (c.date.slice(5) !== monthDay || c.date.slice(0, 4) >= year) continue;
    const list = years.get(c.date);
    if (list) list.push(c);
    else years.set(c.date, [c]);
  }
  return [...years.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([d, list]) => ({ year: d.slice(0, 4), date: d, checkins: list.sort((a, b) => a.at - b.at) }));
}
