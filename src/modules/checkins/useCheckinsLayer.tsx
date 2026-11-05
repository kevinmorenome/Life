import { useMemo } from 'react';
import { DayWidget } from '../../DayWidget';
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
    earliest: days.size ? [...days.keys()].sort()[0] : undefined,
    mark(date) {
      const list = days.get(date);
      if (!list) return null;
      return { tone: 'place', icon: <PinIcon />, label: dayLabel(list), tiles: list.map((c) => c.venue) };
    },
    daySection(date) {
      const list = days.get(date);
      if (!list) return null;
      return (
        <DayWidget id="places" title="Places" icon={<PinIcon />} tone="place" badge={list.length > 1 ? list.length : undefined} summary={list.map((c) => c.venue).join(', ')}>
          <ul className="widget-list">
            {list.map((c) => (
              <li key={c.id}>
                <strong>{c.venue}</strong>
                <span className="muted small">{[c.time, place(c)].filter(Boolean).join(' · ')}</span>
                {c.shout && <span className="small">{c.shout}</span>}
              </li>
            ))}
          </ul>
        </DayWidget>
      );
    },
  };
}
