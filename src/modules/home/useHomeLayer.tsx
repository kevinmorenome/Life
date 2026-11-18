import { useMemo } from 'react';
import { DayWidget } from '../../DayWidget';
import { HomeIcon } from '../../icons';
import { href } from '../../lib/router';
import { useCollection } from '../../lib/useCollection';
import type { CalendarLayer } from '../types';
import { PAYER_NAMES, UNITS, UTILITY_NAMES, byPaidDate, eur, round2 } from './bills';
import type { UtilityBill } from './types';

/**
 * Home bills on the day screen, on the day they were paid. Nothing is marked on the calendar itself, and the due date is never shown
 * there (it is on the bill).
 */
export function useHomeCalendarLayer(): CalendarLayer {
  const { items } = useCollection<UtilityBill>('utilitybills');
  const days = useMemo(() => byPaidDate(items), [items]);
  return {
    daySection(date) {
      const list = days.get(date);
      if (!list) return null;
      const total = round2(list.reduce((a, b) => a + b.amount, 0));
      return (
        <DayWidget id="home-bills" title="Bills paid" icon={<HomeIcon />} tone="home" badge={list.length > 1 ? list.length : undefined} summary={`${list.map((b) => UTILITY_NAMES[b.utility]).join(', ')} · ${eur(total)}`}>
          <ul className="widget-list">
            {list.map((b) => (
              <li key={b.id}>
                <a href={href(`/home/${b.id}`)}><strong>{UTILITY_NAMES[b.utility]}</strong></a>
                <span className="muted small">
                  {[eur(b.amount), b.consumption !== undefined ? `${b.consumption} ${UNITS[b.utility]}` : '', b.paidBy ? `paid by ${PAYER_NAMES[b.paidBy]}` : ''].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </DayWidget>
      );
    },
  };
}
