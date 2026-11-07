import { useMemo } from 'react';
import { DayWidget } from '../../DayWidget';
import { PinIcon } from '../../icons';
import { today } from '../../lib/format';
import { useCollection } from '../../lib/useCollection';
import type { TripitPlan } from '../../../worker/tripitTypes';
import { plannedOnDay } from '../trips/planCheckins';
import type { CalendarLayer } from '../types';
import { byDate, dayLabel, place } from './checkins';
import { RemoveCheckinButton } from './RemoveCheckin';
import type { Checkin } from './types';

/** Swarm check-ins on the shared calendar: a mark on each day and the list on the day screen. */
export function useCheckinsCalendarLayer(): CalendarLayer {
  const { items } = useCollection<Checkin>('checkins');
  const plans = useCollection<TripitPlan>('tripitplans').items;
  const days = useMemo(() => byDate(items), [items]);

  return {
    earliest: days.size ? [...days.keys()].sort()[0] : undefined,
    mark(date) {
      const list = days.get(date);
      if (!list) return null;
      return { tone: 'place', icon: <PinIcon />, label: dayLabel(list), tiles: list.map((c) => c.venue) };
    },
    daySection(date) {
      const done = days.get(date) ?? [];
      const planned = plannedOnDay(plans, items, date, today());
      if (!done.length && !planned.length) return null;
      const names = [...done.map((c) => c.venue), ...planned.map((d) => d.venue)];
      return (
        <DayWidget id="places" title="Places" icon={<PinIcon />} tone="place" badge={done.length + planned.length > 1 ? done.length + planned.length : undefined} summary={names.join(', ')}>
          <ul className="widget-list">
            {done.map((c) => (
              <li key={c.id} className={c.source === 'swarm' ? 'watch-day-play' : undefined}>
                {c.source === 'swarm' ? (
                  <>
                    <div>
                      <strong>{c.venue}</strong>
                      <div className="muted small">{[c.time, place(c)].filter(Boolean).join(' · ')}</div>
                      {c.shout && <div className="small">{c.shout}</div>}
                    </div>
                    <RemoveCheckinButton checkin={c} />
                  </>
                ) : (
                  <>
                    <strong>{c.venue}</strong>
                    <span className="muted small">{[c.time, place(c)].filter(Boolean).join(' · ')}</span>
                    {c.shout && <span className="small">{c.shout}</span>}
                  </>
                )}
              </li>
            ))}
            {planned.map((d) => (
              <li key={d.id} className="planned">
                <strong>{d.venue}</strong>
                <span className="muted small">{[d.time, place(d)].filter(Boolean).join(' · ')}</span>
                <span className="planned-tag muted small">Planned</span>
              </li>
            ))}
          </ul>
        </DayWidget>
      );
    },
  };
}
