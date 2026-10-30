import { useMemo } from 'react';
import { PinIcon } from '../../icons';
import { useCollection } from '../../lib/useCollection';
import type { CalendarLayer } from '../types';
import { byDate, dayLabel, place } from './checkins';
import type { Checkin } from './types';

/** Swarm check-ins on the shared calendar: a mark on each day and the list on the day screen. */
export function useCheckinsCalendarLayer(): CalendarLayer {
  const { items } = useCollection<Checkin>('checkins');
  const days = useMemo(() => byDate(items), [items]);

  return {
    mark(date) {
      const list = days.get(date);
      if (!list) return null;
      return { tone: 'place', icon: <PinIcon />, label: dayLabel(list) };
    },
    daySection(date) {
      const list = days.get(date);
      if (!list) return null;
      return (
        <section className="checkins-day">
          <h2>Places</h2>
          <ul>
            {list.map((c) => (
              <li key={c.id}>
                <span className="muted small">{c.time}</span> <strong>{c.venue}</strong>
                {place(c) && <div className="muted small">{place(c)}</div>}
                {c.shout && <div className="small">{c.shout}</div>}
              </li>
            ))}
          </ul>
        </section>
      );
    },
  };
}
