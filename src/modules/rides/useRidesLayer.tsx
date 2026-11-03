import { useMemo } from 'react';
import { CarIcon } from '../../icons';
import { useCollection } from '../../lib/useCollection';
import type { CalendarLayer } from '../types';
import { byDate, isEuro, PROVIDER_NAME, placeLabel } from './rides';
import type { Ride } from './types';

const fare = (r: Ride) => (isEuro(r) ? `€${r.fare.toFixed(2)}` : `${r.fare.toFixed(2)} ${r.currency}`);

/** Bolt / Uber rides on the shared calendar: a mark on each day with a ride and the list on the day screen. */
export function useRidesCalendarLayer(): CalendarLayer {
  const { items } = useCollection<Ride>('rides');
  const days = useMemo(() => byDate(items), [items]);
  return {
    earliest: days.size ? [...days.keys()].sort()[0] : undefined,
    mark(date) {
      const list = days.get(date);
      if (!list) return null;
      const names = list.map((r) => PROVIDER_NAME[r.provider]);
      return { tone: 'rides', icon: <CarIcon />, label: list.length === 1 ? names[0] : `${list.length} rides`, tiles: names };
    },
    daySection(date) {
      const list = days.get(date);
      if (!list) return null;
      return (
        <section className="checkins-day">
          <h2>Rides</h2>
          <ul>
            {list.map((r) => (
              <li key={r.id}>
                <span className="muted small">{r.time}</span> <strong>{PROVIDER_NAME[r.provider]}</strong>{' '}
                {(r.from || r.to) && (
                  <span className="small">
                    {placeLabel(r.from) ?? '…'} → {placeLabel(r.to) ?? '…'}
                  </span>
                )}{' '}
                <span className="muted small">{fare(r)}</span>
              </li>
            ))}
          </ul>
        </section>
      );
    },
  };
}
