import { useMemo } from 'react';
import { CartIcon } from '../../icons';
import { money } from '../../lib/format';
import { useCollection } from '../../lib/useCollection';
import type { CalendarLayer } from '../types';
import type { WoltOrder } from './types';
import { byDate, placeName } from './wolt';

const amount = (o: WoltOrder) => (o.currency === 'EUR' ? money(o.total).replace(/^[^\d]*/, '€') : `${o.total.toFixed(2)} ${o.currency}`);

/** Wolt orders on the shared calendar: a mark on each day with an order and the list on the day screen. */
export function useWoltCalendarLayer(): CalendarLayer {
  const { items } = useCollection<WoltOrder>('woltorders');
  const days = useMemo(() => byDate(items), [items]);
  return {
    earliest: days.size ? [...days.keys()].sort()[0] : undefined,
    mark(date) {
      const list = days.get(date);
      if (!list) return null;
      const names = list.map((o) => placeName(o.restaurant));
      return { tone: 'wolt', icon: <CartIcon />, label: names.length === 1 ? names[0] : `${names.length} orders`, tiles: names };
    },
    daySection(date) {
      const list = days.get(date);
      if (!list) return null;
      return (
        <section className="checkins-day">
          <h2>Wolt</h2>
          <ul>
            {list.map((o) => (
              <li key={o.id}>
                <span className="muted small">{o.time}</span> <strong>{o.restaurant}</strong> <span className="muted small">{amount(o)}</span>
              </li>
            ))}
          </ul>
        </section>
      );
    },
  };
}
