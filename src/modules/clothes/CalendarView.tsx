import { useMemo } from 'react';
import { today } from '../../lib/format';
import { href } from '../../lib/router';
import { addMonths, monthGrid, wearsByDay, type DayWear } from './calendar';
import { tripsOnDate } from '../packing/packing';
import type { Trip } from '../packing/types';
import { ItemThumb } from './ItemThumb';
import { outfitPieces } from './outfits';
import { plannedDays } from './plans';
import type { ClothingItem, Outfit, Plan } from './types';

interface Props {
  /** YYYY-MM; defaults to the current month. */
  month?: string;
  items: ClothingItem[];
  outfits: Outfit[];
  trips?: Trip[];
  plans?: Plan[];
}

export function CalendarView({ month, items, outfits, trips = [], plans = [] }: Props) {
  const now = today();
  const ym = month ?? now.slice(0, 7);
  const [year, m] = ym.split('-').map(Number);
  const days = useMemo(() => wearsByDay(items, outfits), [items, outfits]);
  const planned = useMemo(() => plannedDays(plans, outfits), [plans, outfits]);
  const weeks = monthGrid(year, m);
  const title = new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  // Monday-first weekday names in the viewer's language (Jan 5, 2026 was a Monday).
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2026, 0, 5 + i)).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
  );
  const wornThisMonth = [...days.keys()].filter((d) => d.startsWith(ym)).length;

  return (
    <>
      <h1 className="page-title">Calendar</h1>

      <div className="month-nav">
        <a className="btn btn-ghost" href={href(`/clothes/calendar/${addMonths(ym, -1)}`)} aria-label="Previous month">
          ‹
        </a>
        <div className="month-title">
          <strong>{title}</strong>
          <span className="muted small">
            {wornThisMonth} {wornThisMonth === 1 ? 'day' : 'days'} logged
          </span>
        </div>
        <a className="btn btn-ghost" href={href(`/clothes/calendar/${addMonths(ym, 1)}`)} aria-label="Next month">
          ›
        </a>
      </div>
      {ym !== now.slice(0, 7) && (
        <p className="center">
          <a href={href('/clothes/calendar')} className="small">
            Back to this month
          </a>
        </p>
      )}

      <div className="calendar" role="grid" aria-label={title}>
        <div className="calendar-row calendar-head" role="row">
          {weekdays.map((w) => (
            <span key={w} role="columnheader">
              {w}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} className="calendar-row" role="row">
            {week.map(({ date, inMonth }) => (
              <a
                key={date}
                role="gridcell"
                href={href(`/clothes/calendar/${date}`)}
                className={`calendar-day${inMonth ? '' : ' out'}${date === now ? ' today' : ''}${tripsOnDate(trips, date).length ? ' trip' : ''}${planned.has(date) ? ' planned' : ''}`}
                aria-label={date}
              >
                <DayBubble wear={days.get(date)} items={items} />
                <span className="day-num">{Number(date.slice(8))}</span>
              </a>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/** Round photo of what was worn: the first outfit's top pieces, or the first item. */
function DayBubble({ wear, items }: { wear?: DayWear; items: ClothingItem[] }) {
  if (!wear) return null;
  const pieces = wear.outfits.length ? outfitPieces(wear.outfits[0], items).slice(0, 2) : wear.items.slice(0, 2);
  if (!pieces.length) return <span className="day-bubble" />;
  return (
    <span className={`day-bubble pieces-${pieces.length}`}>
      {pieces.map((p) => (
        <ItemThumb key={p.id} item={p} />
      ))}
    </span>
  );
}
