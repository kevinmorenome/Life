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
export function place(c: Pick<Checkin, 'category' | 'city'>): string {
  return [c.category, c.city].filter(Boolean).join(' · ');
}

/** Without a time, a check-in sits at midday, so it stays within its day and orders after the morning ones. */
const clock = (date: string, time: string): number => Date.parse(`${date}T${time || '12:00'}:00Z`) / 1000;

/**
 * The check-in moved to another day and time, for a Swarm one that was logged on the wrong day. The time can be
 * left empty when it isn't known (`time` ''). `at` shifts by the same amount as the local clock (it orders
 * check-ins across days), the place stays. Returns the same record when nothing changed or the input isn't a
 * date and a time (or empty).
 */
export function moveCheckin(c: Checkin, date: string, time: string, now: string): Checkin {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(time === '' || /^\d{2}:\d{2}$/.test(time))) return c;
  if (date === c.date && time === c.time) return c;
  const shift = clock(date, time) - clock(c.date, c.time);
  if (!Number.isFinite(shift)) return c;
  return { ...c, date, time, at: c.at + shift, updatedAt: now };
}
