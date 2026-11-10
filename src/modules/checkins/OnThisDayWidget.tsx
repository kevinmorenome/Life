import { useMemo } from 'react';
import { DayWidget } from '../../DayWidget';
import { ClockIcon } from '../../icons';
import { shortDate } from '../../lib/format';
import { href } from '../../lib/router';
import { useCollection } from '../../lib/useCollection';
import { wearsByDay } from '../clothes/calendar';
import type { ClothingItem, Outfit } from '../clothes/types';
import type { OnThisDayYear } from './onThisDay';

const yearsAgo = (year: string, date: string) => {
  const n = Number(date.slice(0, 4)) - Number(year);
  return n === 1 ? '1 year ago' : `${n} years ago`;
};

/** The day screen's look back: what you did, and wore, on this day in earlier years. Each year links to that day. */
export function OnThisDayWidget({ date, years }: { date: string; years: OnThisDayYear[] }) {
  const clothes = useCollection<ClothingItem>('clothes').items;
  const outfits = useCollection<Outfit>('outfits').items;
  const wears = useMemo(() => wearsByDay(clothes, outfits), [clothes, outfits]);
  const summary = years.map((y) => `${y.year}: ${y.checkins.map((c) => c.venue).join(', ')}`).join(' · ');

  return (
    <DayWidget id="on-this-day" title="On this day" icon={<ClockIcon />} tone="place" size="full" badge={years.length > 1 ? years.length : undefined} summary={summary}>
      <ul className="widget-list">
        {years.map((y) => {
          const worn = wears.get(y.date);
          const names = [...(worn?.outfits.map((o) => o.name || 'Outfit') ?? []), ...(worn?.items.map((i) => i.name) ?? [])];
          return (
            <li key={y.date}>
              <a className="widget-link" href={href(`/calendar/${y.date}`)} aria-label={`Open ${shortDate(y.date)}, ${y.year}`}>
                <strong>{y.year}</strong> <span className="muted small">{yearsAgo(y.year, date)}</span>
              </a>
              <span className="small">{y.checkins.map((c) => c.venue).join(', ')}</span>
              {names.length > 0 && <span className="small muted">Wore {names.join(', ')}</span>}
            </li>
          );
        })}
      </ul>
    </DayWidget>
  );
}
