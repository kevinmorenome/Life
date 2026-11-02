import { useMemo, useState } from 'react';
import { shortDate, today } from '../../lib/format';
import { useCollection } from '../../lib/useCollection';
import { Empty, HBars, ReadoutColumns, Section, Tile, Toggle, type Bar } from '../clothes/charts';
import { RemovePlayButton } from './RemovePlay';
import type { Play } from './types';
import { dayStreak, episodeCode, hourCounts, monthlyCounts, newestFirst, searchPlays, summarize, topTitles, weekdayCounts, when } from './watched';

const PERIODS = [
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const monthLabel = (ym: string, style: 'short' | 'long' = 'short') => new Date(ym + '-01T00:00:00Z').toLocaleDateString(undefined, { month: style, year: '2-digit', timeZone: 'UTC' });

/** Stats → Watching: what you watched, from Trakt. */
export function WatchingStatsRoute() {
  const { items, loading } = useCollection<Play>('watched');
  if (loading) return <p className="muted">Loading…</p>;
  if (items.length === 0) {
    return (
      <Section title="Nothing yet">
        <Empty>Connect Trakt in Settings and fetch your history, and the numbers build up here.</Empty>
      </Section>
    );
  }
  return <Loaded plays={items} now={today()} />;
}

function Loaded({ plays, now }: { plays: Play[]; now: string }) {
  const [period, setPeriod] = useState('year');
  const prefix = period === 'month' ? now.slice(0, 7) : period === 'year' ? now.slice(0, 4) : '';
  const s = useMemo(() => summarize(plays, prefix), [plays, prefix]);
  const streak = useMemo(() => dayStreak(plays, now), [plays, now]);
  const shows = useMemo(() => topTitles(plays, prefix, 'episode').slice(0, 10), [plays, prefix]);
  const movies = useMemo(() => topTitles(plays, prefix, 'movie').filter((m) => m.count > 1).slice(0, 5), [plays, prefix]);
  const months = useMemo(() => monthlyCounts(plays, now.slice(0, 7)), [plays, now]);
  const weekdays = useMemo(() => weekdayCounts(plays, prefix), [plays, prefix]);
  const hours = useMemo(() => hourCounts(plays, prefix), [plays, prefix]);

  const monthBars: Bar[] = months.map((m, i) => ({ key: m.month, tick: i % 3 === 0 ? monthLabel(m.month) : '', value: m.movies + m.episodes }));
  const weekdayBars: Bar[] = weekdays.map((value, i) => ({ key: String(i), tick: WEEKDAYS[i][0], value }));
  const hourBars: Bar[] = hours.map((value, h) => ({ key: String(h), tick: h % 4 === 0 ? String(h).padStart(2, '0') : '', value }));
  const busiest = weekdays.indexOf(Math.max(...weekdays));
  const peakHour = hours.indexOf(Math.max(...hours));

  return (
    <>
      <Toggle label="Period" options={PERIODS} value={period} onChange={setPeriod} />
      <div className="tiles">
        <Tile value={String(s.movies)} label="movies" tone={0} />
        <Tile value={String(s.episodes)} label="episodes" tone={1} />
        <Tile value={String(s.shows)} label="different shows" tone={2} />
        <Tile value={String(streak.current)} label={`days in a row now (longest ${streak.longest})`} tone={3} />
      </div>
      <Section title="Top shows" note="By episodes watched in the period.">
        {shows.length === 0 ? (
          <Empty>No episodes in this period.</Empty>
        ) : (
          <HBars rows={shows.map((r) => ({ key: r.key, label: r.title, value: r.count, shown: `${count(r.count, 'episode')} · ${count(r.days, 'day')}` }))} />
        )}
      </Section>
      {movies.length > 0 && (
        <Section title="Movies you watched again" note="More than one play in the period.">
          <HBars color="var(--tone-orange)" rows={movies.map((r) => ({ key: r.key, label: r.title, value: r.count, shown: `${r.count}×` }))} />
        </Section>
      )}
      <Section title="Plays per month" note="Movies and episodes together, the last 12 months.">
        <ReadoutColumns
          bars={monthBars}
          big={(b) => count(b.value, 'play')}
          small={(b) => {
            const m = months.find((x) => x.month === b.key);
            return `${monthLabel(b.key, 'long')} · ${m?.movies ?? 0} movies, ${m?.episodes ?? 0} episodes`;
          }}
          initial={months[months.length - 1]?.month}
        />
      </Section>
      <Section title="Weekdays" note={s.plays ? `Most on ${WEEKDAYS[busiest]}.` : undefined}>
        <ReadoutColumns key={`wd-${period}`} bars={weekdayBars} color="var(--tone-orange)" big={(b) => count(b.value, 'play')} small={(b) => WEEKDAYS[Number(b.key)]} initial={String(busiest)} />
      </Section>
      <Section title="When you watch" note={s.plays ? `Most around ${String(peakHour).padStart(2, '0')}:00.` : undefined}>
        <ReadoutColumns key={`h-${period}`} bars={hourBars} color="var(--tone-orange)" big={(b) => count(b.value, 'play')} small={(b) => `${b.key.padStart(2, '0')}:00–${b.key.padStart(2, '0')}:59`} initial={String(peakHour)} />
      </Section>
      <AllPlays plays={plays} />
      <p className="muted small">Data comes from your Trakt watch history. Plays removed on Trakt after they were fetched stay here.</p>
    </>
  );
}

function AllPlays({ plays }: { plays: Play[] }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const found = useMemo(() => searchPlays(newestFirst(plays), query), [plays, query]);
  return (
    <Section title="History" note="Newest first. Search by title, episode or date.">
      <input type="search" className="search" placeholder="Search history" aria-label="Search history" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(20); }} />
      {found.length === 0 ? (
        <Empty>Nothing matches.</Empty>
      ) : (
        <ul className="watch-plays">
          {found.slice(0, limit).map((p) => {
            const w = when(p);
            return (
              <li key={p.id}>
                <span className="wolt-when">
                  {shortDate(w.date)}
                  <span className="muted small"> {w.time}</span>
                </span>
                <span>
                  {p.title}
                  {p.kind === 'episode' && <span className="muted small"> {[episodeCode(p), p.episodeTitle].filter(Boolean).join(' · ')}</span>}
                </span>
                <RemovePlayButton play={p} />
              </li>
            );
          })}
        </ul>
      )}
      {found.length > limit && (
        <button type="button" className="btn" onClick={() => setLimit((l) => l + 30)}>
          Show more ({found.length - limit})
        </button>
      )}
    </Section>
  );
}
