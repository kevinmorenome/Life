import { useMemo } from 'react';
import { href } from '../../lib/router';
import { addMonths, monthGrid } from '../clothes/calendar';
import { ItemThumb } from '../clothes/ItemThumb';
import { outfitPieces } from '../clothes/outfits';
import type { ClothingItem, Outfit } from '../clothes/types';
import type { Trip } from './types';

interface Props {
  trip: Trip;
  items: ClothingItem[];
  outfits: Outfit[];
}

// Monday-first weekday names in the viewer's language (Jan 5, 2026 was a Monday).
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(Date.UTC(2026, 0, 5 + i)).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
);

/** A month calendar (one per month the trip touches) where only the trip's dates are tappable. */
export function TripCalendar({ trip, items, outfits }: Props) {
  const outfitById = useMemo(() => new Map(outfits.map((o) => [o.id, o])), [outfits]);
  const months: string[] = [];
  for (let m = trip.startDate.slice(0, 7); m <= trip.endDate.slice(0, 7) && months.length < 4; m = addMonths(m, 1)) {
    months.push(m);
  }
  const inTrip = (d: string) => d >= trip.startDate && d <= trip.endDate;

  return (
    <>
      <p className="muted small">Tap a day to choose its outfits.</p>
      {months.map((ym) => {
        const [year, m] = ym.split('-').map(Number);
        const title = new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        });
        const weeks = monthGrid(year, m).filter((w) => w.some((c) => c.inMonth && inTrip(c.date)));
        return (
          <div key={ym} className="calendar trip-calendar" role="grid" aria-label={title}>
            <strong className="trip-month">{title}</strong>
            <div className="calendar-row calendar-head" role="row">
              {WEEKDAYS.map((w) => (
                <span key={w} role="columnheader">
                  {w}
                </span>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0].date} className="calendar-row" role="row">
                {week.map(({ date, inMonth }) => {
                  if (!inMonth || !inTrip(date)) return <span key={date} role="gridcell" aria-hidden />;
                  const planned = (trip.outfitPlan[date] ?? []).map((id) => outfitById.get(id)).filter((o): o is Outfit => !!o);
                  const pieces = planned[0] ? outfitPieces(planned[0], items).slice(0, 2) : [];
                  return (
                    <a
                      key={date}
                      role="gridcell"
                      href={href(`/packing/${trip.id}/day/${date}`)}
                      className="calendar-day in-trip"
                      aria-label={`${date}, ${planned.length} ${planned.length === 1 ? 'outfit' : 'outfits'}`}
                    >
                      {planned.length > 0 && (
                        <span className={`day-bubble pieces-${pieces.length}`}>
                          {pieces.map((p) => (
                            <ItemThumb key={p.id} item={p} />
                          ))}
                        </span>
                      )}
                      <span className="day-num">{Number(date.slice(8))}</span>
                      {planned.length > 1 && <span className="day-count">{planned.length}</span>}
                    </a>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
