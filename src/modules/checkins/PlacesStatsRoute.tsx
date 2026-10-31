import { useMemo, useState } from 'react';
import { shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { useCollection } from '../../lib/useCollection';
import { wearsByDay, type DayWear } from '../clothes/calendar';
import { Empty, HBars, ReadoutColumns, Section, Tile, Toggle, type Bar } from '../clothes/charts';
import type { ClothingItem, Outfit } from '../clothes/types';
import {
  checkinStreak,
  countryCount,
  hourCounts,
  monthlyCounts,
  newVsRepeat,
  topCategories,
  topCities,
  topVenues,
  weekdayCounts,
  wornOnDays,
  type VenueRow,
} from './placeStats';
import type { Checkin } from './types';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'trends', label: 'Trends' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const PERIODS = [
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

const monthName = (ym: string, style: 'short' | 'narrow' | 'long' = 'short') =>
  new Date(ym + '-01T00:00:00Z').toLocaleDateString(undefined, { month: style, timeZone: 'UTC' });

const times = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`;

export function PlacesStatsRoute({ tab: routeTab }: { tab?: string }) {
  const checkins = useCollection<Checkin>('checkins');
  const clothes = useCollection<ClothingItem>('clothes');
  const outfits = useCollection<Outfit>('outfits');
  const wears = useMemo(() => wearsByDay(clothes.items, outfits.items), [clothes.items, outfits.items]);
  const now = today();
  const tab: TabId = TABS.find((t) => t.id === routeTab)?.id ?? 'overview';

  if (checkins.loading) return <p className="muted">Loading…</p>;
  if (checkins.items.length === 0) {
    return (
      <Section title="Nothing yet">
        <Empty>Connect Swarm in Settings and fetch your check-ins, and the numbers build up here.</Empty>
      </Section>
    );
  }
  return (
    <>
      <div className="seg seg-sub" role="tablist" aria-label="Places stats sections" style={{ ['--tabs' as string]: TABS.length }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`places-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="places-panel"
            // Replace, so going back doesn't walk through every tab switch.
            onClick={() => window.location.replace(href(`/stats/checkins/${t.id}`))}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="places-panel" role="tabpanel" aria-labelledby={`places-tab-${tab}`}>
        {tab === 'overview' ? <Overview checkins={checkins.items} wears={wears} now={now} /> : <Trends checkins={checkins.items} now={now} />}
      </div>
    </>
  );
}

function Overview({ checkins, wears, now }: { checkins: Checkin[]; wears: Map<string, DayWear>; now: string }) {
  const [period, setPeriod] = useState('year');
  const prefix = period === 'month' ? now.slice(0, 7) : period === 'year' ? now.slice(0, 4) : '';
  const venues = useMemo(() => topVenues(checkins, prefix), [checkins, prefix]);
  const fresh = newVsRepeat(checkins, prefix);
  const streak = checkinStreak(checkins, now);
  const categories = topCategories(checkins, prefix).slice(0, 8);
  const cities = topCities(checkins, prefix).slice(0, 8);
  const countries = countryCount(checkins, prefix);

  return (
    <>
      <Toggle label="Period" options={PERIODS} value={period} onChange={setPeriod} />
      <div className="tiles">
        <Tile value={String(fresh.total)} label="check-ins" tone={0} />
        <Tile value={String(venues.length)} label="places" tone={1} />
        <Tile value={String(fresh.newPlaces)} label="new places" tone={2} />
        <Tile value={String(streak.current)} label={`days in a row now (longest ${streak.longest})`} tone={3} />
      </div>
      <Section title="Top places" note="Tap a place to see what you wore on the days you went.">
        {venues.length === 0 ? (
          <Empty>No check-ins in this period.</Empty>
        ) : (
          <ul className="place-list">
            {venues.slice(0, 15).map((v) => (
              <PlaceRow key={v.key} venue={v} wears={wears} max={venues[0].count} />
            ))}
          </ul>
        )}
      </Section>
      {categories.length > 0 && (
        <Section title="Kinds of places">
          <HBars rows={categories.map((c) => ({ key: c.name, label: c.name, value: c.count, shown: String(c.count) }))} />
        </Section>
      )}
      {cities.length > 0 && (
        <Section title="Cities" note={countries > 0 ? `${countries} ${countries === 1 ? 'country' : 'countries'}.` : undefined}>
          <HBars rows={cities.map((c) => ({ key: c.name, label: c.name, value: c.count, shown: String(c.count) }))} color="var(--tone-blue)" />
        </Section>
      )}
    </>
  );
}

function PlaceRow({ venue: v, wears, max }: { venue: VenueRow; wears: Map<string, DayWear>; max: number }) {
  const [open, setOpen] = useState(false);
  // Only computed once opened.
  const worn = open ? wornOnDays(v.days, wears) : undefined;
  return (
    <li>
      <button type="button" className="place-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="hbar-head">
          <span className="hbar-label">{v.name}</span>
          <span className="hbar-value">{v.count}</span>
        </span>
        <span className="bar-track">
          <span className="bar-fill" style={{ width: `${(v.count / max) * 100}%` }} />
        </span>
        <span className="hbar-sub">
          {[v.category, v.city].filter(Boolean).join(' · ')}
          {v.category || v.city ? ' · ' : ''}
          {v.first === v.last ? shortDate(v.first) : `${shortDate(v.first)} – ${shortDate(v.last)}`}
        </span>
      </button>
      {worn && (
        <div className="place-worn">
          {worn.outfits.length === 0 && worn.items.length === 0 ? (
            <Empty>Nothing logged on these days.</Empty>
          ) : (
            <>
              {worn.outfits.length > 0 && (
                <p className="small">
                  <strong>Outfits</strong>
                  {worn.outfits.slice(0, 6).map((o) => (
                    <span key={o.id}>
                      {' · '}
                      <a href={href(`/clothes/outfits/${o.id}`)}>{o.name || 'Outfit'}</a> {o.count > 1 ? `×${o.count}` : ''}
                    </span>
                  ))}
                </p>
              )}
              {worn.items.length > 0 && (
                <p className="small">
                  <strong>Pieces</strong>
                  {worn.items.slice(0, 6).map((i) => (
                    <span key={i.id}>
                      {' · '}
                      {i.name} {i.count > 1 ? `×${i.count}` : ''}
                    </span>
                  ))}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function Trends({ checkins, now }: { checkins: Checkin[]; now: string }) {
  const [period, setPeriod] = useState('all');
  const prefix = period === 'year' ? now.slice(0, 4) : '';
  const bars: Bar[] = monthlyCounts(checkins, now.slice(0, 7), 12).map((m) => ({ key: m.month, tick: monthName(m.month, 'narrow'), value: m.count }));
  const weekdays = weekdayCounts(checkins, prefix);
  const hours = hourCounts(checkins, prefix);
  const names = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 0, 5 + i)).toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' }));
  const hourBars: Bar[] = hours.map((value, h) => ({ key: String(h), tick: h % 6 === 0 ? String(h) : '', value }));
  return (
    <>
      <Section title="Month by month" note="Check-ins in the last 12 months.">
        <ReadoutColumns
          bars={bars}
          big={(b) => times(b.value)}
          small={(b) => `${monthName(b.key, 'long')} ${b.key.slice(0, 4)}`}
          initial={now.slice(0, 7)}
        />
      </Section>
      <Toggle
        label="Period"
        options={[
          { value: 'all', label: 'All time' },
          { value: 'year', label: 'This year' },
        ]}
        value={period}
        onChange={setPeriod}
      />
      <Section title="Which days you go out">
        <HBars rows={weekdays.map((v, i) => ({ key: names[i], label: names[i], value: v, shown: String(v) }))} color="var(--tone-purple)" />
      </Section>
      <Section title="What time of day" note="Hour of the check-in, local to where you were.">
        <ReadoutColumns
          key={period}
          bars={hourBars}
          color="var(--tone-orange)"
          big={(b) => times(b.value)}
          small={(b) => `${b.key.padStart(2, '0')}:00–${b.key.padStart(2, '0')}:59`}
          initial={String(hours.indexOf(Math.max(...hours)))}
        />
      </Section>
    </>
  );
}
