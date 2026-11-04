import { useMemo, useState } from 'react';
import { today } from '../../lib/format';
import { useCollection } from '../../lib/useCollection';
import { Empty, HBars, ReadoutColumns, Section, Tile, Toggle, type Bar } from '../clothes/charts';
import { dayStreak, duration, hoursOf, hourPlays, monthlyTotals, summarize, topOf, weekdayPlays } from './music';
import type { MusicDay } from './types';

const PERIODS = [
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const count = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
const monthLabel = (ym: string, style: 'short' | 'long' = 'short') => new Date(ym + '-01T00:00:00Z').toLocaleDateString(undefined, { month: style, year: '2-digit', timeZone: 'UTC' });

/** Stats → Music: what you listened to, from stats.fm. */
export function MusicStatsRoute() {
  const { items, loading } = useCollection<MusicDay>('musicdays');
  if (loading) return <p className="muted">Loading…</p>;
  if (items.length === 0) {
    return (
      <Section title="Nothing yet">
        <Empty>Connect stats.fm in Settings and fetch your history, and the numbers build up here.</Empty>
      </Section>
    );
  }
  return <Loaded days={items} now={today()} />;
}

function Loaded({ days, now }: { days: MusicDay[]; now: string }) {
  const [period, setPeriod] = useState('year');
  const prefix = period === 'month' ? now.slice(0, 7) : period === 'year' ? now.slice(0, 4) : '';
  const s = useMemo(() => summarize(days, prefix), [days, prefix]);
  const streak = useMemo(() => dayStreak(days, now), [days, now]);
  const artists = useMemo(() => topOf(days, 'topArtists', prefix), [days, prefix]);
  const tracks = useMemo(() => topOf(days, 'topTracks', prefix), [days, prefix]);
  const months = useMemo(() => monthlyTotals(days, now.slice(0, 7)), [days, now]);
  const weekdays = useMemo(() => weekdayPlays(days, prefix), [days, prefix]);
  const hours = useMemo(() => hourPlays(days, prefix), [days, prefix]);

  const monthBars: Bar[] = months.map((m, i) => ({ key: m.month, tick: i % 3 === 0 ? monthLabel(m.month) : '', value: Math.round(m.ms / 3_600_000) }));
  const weekdayBars: Bar[] = weekdays.map((value, i) => ({ key: String(i), tick: WEEKDAYS[i][0], value }));
  const hourBars: Bar[] = hours.map((value, h) => ({ key: String(h), tick: h % 4 === 0 ? String(h).padStart(2, '0') : '', value }));
  const busiest = weekdays.indexOf(Math.max(...weekdays));
  const peakHour = hours.indexOf(Math.max(...hours));

  return (
    <>
      <Toggle label="Period" options={PERIODS} value={period} onChange={setPeriod} />
      <div className="tiles">
        <Tile value={String(hoursOf(s.ms))} label="hours listened" tone={0} />
        <Tile value={s.plays.toLocaleString()} label="plays" tone={1} />
        <Tile value={String(s.activeDays)} label="days with music" tone={2} />
        <Tile value={String(streak.current)} label={`days in a row now (longest ${streak.longest})`} tone={3} />
      </div>
      <Section title="Top artists" note="By plays in each day's top 5, so an artist you only ever hear a little of a day can be missing.">
        {artists.length === 0 ? <Empty>No listening in this period.</Empty> : <HBars rows={artists.map((r) => ({ key: String(r.id), label: r.name || `Artist ${r.id}`, value: r.plays, shown: `${count(r.plays, 'play')} · ${count(r.days, 'day')}` }))} />}
      </Section>
      <Section title="Top tracks" note="Same count: plays in each day's top 5.">
        {tracks.length === 0 ? (
          <Empty>No listening in this period.</Empty>
        ) : (
          <HBars color="var(--tone-orange)" rows={tracks.map((r) => ({ key: String(r.id), label: r.artist ? `${r.name} · ${r.artist}` : r.name, value: r.plays, shown: `${r.plays}×` }))} />
        )}
      </Section>
      <Section title="Hours per month" note="The last 12 months.">
        <ReadoutColumns
          bars={monthBars}
          big={(b) => `${b.value} ${b.value === 1 ? 'hour' : 'hours'}`}
          small={(b) => {
            const m = months.find((x) => x.month === b.key);
            return `${monthLabel(b.key, 'long')} · ${count(m?.plays ?? 0, 'play')} · ${duration(m?.ms ?? 0)}`;
          }}
          initial={months[months.length - 1]?.month}
        />
      </Section>
      <Section title="Weekdays" note={s.plays ? `Most on ${WEEKDAYS[busiest]}.` : undefined}>
        <ReadoutColumns key={`wd-${period}`} bars={weekdayBars} color="var(--tone-orange)" big={(b) => count(b.value, 'play')} small={(b) => WEEKDAYS[Number(b.key)]} initial={String(busiest)} />
      </Section>
      <Section title="When you listen" note={s.plays ? `Most around ${String(peakHour).padStart(2, '0')}:00.` : undefined}>
        <ReadoutColumns key={`h-${period}`} bars={hourBars} color="var(--tone-orange)" big={(b) => count(b.value, 'play')} small={(b) => `${b.key.padStart(2, '0')}:00–${b.key.padStart(2, '0')}:59`} initial={String(peakHour)} />
      </Section>
      <p className="muted small">Data comes from stats.fm, one summary per day in your stats.fm time zone. Plays count the way stats.fm counts them (30 seconds or more).</p>
    </>
  );
}
