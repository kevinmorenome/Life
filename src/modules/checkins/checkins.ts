import type { Checkin } from './types';

/** Check-ins grouped by local date, each day oldest first. */
export function byDate(checkins: Checkin[]): Map<string, Checkin[]> {
  const days = new Map<string, Checkin[]>();
  for (const c of [...checkins].sort((a, b) => a.at - b.at)) {
    const list = days.get(c.date);
    if (list) list.push(c);
    else days.set(c.date, [c]);
  }
  return days;
}

/** Short label for a day's mark: the venue, or how many places when there were several. */
export function dayLabel(list: Checkin[]): string {
  return list.length === 1 ? list[0].venue : `${list.length} places`;
}

/** "Café Nero · London" style second line. */
export function place(c: Checkin): string {
  return [c.category, c.city].filter(Boolean).join(' · ');
}
