import { useMemo } from 'react';
import { DayWidget } from '../../DayWidget';
import { PinIcon } from '../../icons';
import { useSettings } from '../../lib/settings';
import { useCollection } from '../../lib/useCollection';
import { Flag } from '../countries/Flag';
import { checkinCountry, homeCountry } from '../countries/countries';
import type { CalendarLayer } from '../types';
import { byDate, dayLabel, place } from './checkins';
import type { Checkin } from './types';

/** The country outside `home` where most of the day's check-ins were, if any. */
export function abroadCountry(list: Checkin[], home: string | undefined): string | undefined {
  if (!home) return undefined;
  const counts = new Map<string, number>();
  for (const c of list) {
    const code = checkinCountry(c);
    if (code && code !== home) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

/** Swarm check-ins on the shared calendar: a mark on each day and the list on the day screen. */
export function useCheckinsCalendarLayer(): CalendarLayer {
  const { items } = useCollection<Checkin>('checkins');
  const days = useMemo(() => byDate(items), [items]);
  const { settings } = useSettings();
  const home = useMemo(() => homeCountry(items, settings.homeCountry), [items, settings.homeCountry]);

  return {
    earliest: days.size ? [...days.keys()].sort()[0] : undefined,
    mark(date) {
      const list = days.get(date);
      if (!list) return null;
      // A day with check-ins in another country shows that country's flag in place of the pin.
      const abroad = abroadCountry(list, home);
      return { tone: 'place', icon: abroad ? <Flag code={abroad} /> : <PinIcon />, label: dayLabel(list), tiles: list.map((c) => c.venue) };
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
