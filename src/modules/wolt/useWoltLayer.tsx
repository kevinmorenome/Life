import { useMemo } from 'react';
import { DayWidget } from '../../DayWidget';
import { BagIcon } from '../../icons';
import { money } from '../../lib/format';
import type { CalendarLayer } from '../types';
import type { WoltOrder } from './types';
import { useTakeoutOrders } from './useTakeoutOrders';
import { SERVICE_NAMES, byDate, placeName, serviceOf } from './wolt';

const amount = (o: WoltOrder) => (o.currency === 'EUR' ? money(o.total).replace(/^[^\d]*/, '€') : `${o.total.toFixed(2)} ${o.currency}`);

/** Wolt orders on the shared calendar: a mark on each day with an order and the list on the day screen. */
export function useWoltCalendarLayer(): CalendarLayer {
  const { items } = useTakeoutOrders();
  const days = useMemo(() => byDate(items), [items]);
  return {
    earliest: days.size ? [...days.keys()].sort()[0] : undefined,
    mark(date) {
      const list = days.get(date);
      if (!list) return null;
      const names = list.map((o) => placeName(o.restaurant));
      return { tone: 'wolt', icon: <BagIcon />, label: names.length === 1 ? names[0] : `${names.length} orders`, tiles: names };
    },
    daySection(date) {
      const list = days.get(date);
      if (!list) return null;
      return (
        <DayWidget id="takeout" title="Takeout" icon={<BagIcon />} tone="wolt" badge={list.length > 1 ? list.length : undefined} summary={[list.map((o) => placeName(o.restaurant)).join(', '), amount(list[0])].join(' · ')}>
          <ul className="widget-list">
            {list.map((o) => (
              <li key={o.id}>
                <strong>{o.restaurant}</strong>{serviceOf(o) !== 'wolt' && <span className="muted small"> {SERVICE_NAMES[serviceOf(o)]}</span>}
                <span className="muted small">{[o.time, amount(o)].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </DayWidget>
      );
    },
  };
}
