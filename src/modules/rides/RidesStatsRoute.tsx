import { useMemo, useState } from 'react';
import { shortDate, today } from '../../lib/format';
import { useCollection } from '../../lib/useCollection';
import { Empty, HBars, ReadoutColumns, Section, Tile, type Bar } from '../clothes/charts';
import { hourCounts, monthlySpend, newestFirst, otherCurrencies, PROVIDER_NAME, placeLabel, searchRides, summarize, topPlaces, weekdayCounts } from './rides';
import type { Ride } from './types';

const eur = (n: number) => `€${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const eur0 = (n: number) => `€${Math.round(n).toLocaleString()}`;
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const monthLabel = (ym: string, style: 'short' | 'long' = 'short') => new Date(ym + '-01T00:00:00Z').toLocaleDateString(undefined, { month: style, year: '2-digit', timeZone: 'UTC' });
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function RidesStatsRoute() {
  const { items, loading } = useCollection<Ride>('rides');
  if (loading) return <p className="muted">Loading…</p>;
  if (items.length === 0) {
    return (
      <Section title="Nothing yet">
        <Empty>Ask Claude to read your Bolt and Uber receipt emails and add the rides; the numbers build up here.</Empty>
      </Section>
    );
  }
  return <Loaded rides={items} now={today()} />;
}

function Loaded({ rides, now }: { rides: Ride[]; now: string }) {
  const year = now.slice(0, 4);
  const s = useMemo(() => summarize(rides, year), [rides, year]);
  const months = useMemo(() => monthlySpend(rides, now.slice(0, 7)), [rides, now]);
  const drops = useMemo(() => topPlaces(rides, 'to'), [rides]);
  const picks = useMemo(() => topPlaces(rides, 'from'), [rides]);
  const hours = useMemo(() => hourCounts(rides), [rides]);
  const weekdays = useMemo(() => weekdayCounts(rides), [rides]);
  const foreign = useMemo(() => otherCurrencies(rides), [rides]);

  const monthBars: Bar[] = months.map((m, i) => ({ key: m.month, tick: i % 6 === 0 ? monthLabel(m.month) : '', value: m.spent }));
  const hourBars: Bar[] = hours.map((value, h) => ({ key: String(h), tick: h % 4 === 0 ? String(h).padStart(2, '0') : '', value }));
  const dayBars: Bar[] = weekdays.map((value, i) => ({ key: String(i), tick: DAYS[i], value }));

  return (
    <>
      <p className="muted">
        You have taken <strong>{s.rides}</strong> {s.rides === 1 ? 'ride' : 'rides'}
        {s.since ? <> since <strong>{new Date(s.since + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</strong></> : null}, spending <strong>{eur0(s.spent)}</strong>
        {s.km > 0 ? <> over <strong>{Math.round(s.km).toLocaleString()} km</strong></> : null}.
      </p>
      <div className="tiles">
        <Tile value={String(s.rides)} label="rides, all time" tone={0} />
        <Tile value={eur0(s.spent)} label="spent (EUR)" tone={1} />
        <Tile value={eur(s.average)} label="average ride" tone={2} />
        <Tile value={eur0(s.yearSpent)} label={`spent in ${year} (${count(s.yearRides, 'ride')})`} tone={3} />
      </div>
      <Section title="Bolt vs Uber" note="Rides and euro spend per app.">
        <HBars rows={s.byProvider.map((p) => ({ key: p.provider, label: PROVIDER_NAME[p.provider], value: p.rides, shown: `${count(p.rides, 'ride')} · ${eur0(p.spent)}` }))} />
      </Section>
      <Section title="Spend per month" note="Euro rides, by the month they started. Months without rides show as empty.">
        <ReadoutColumns bars={monthBars} big={(b) => eur(b.value)} small={(b) => `${monthLabel(b.key, 'long')} · ${count(months.find((m) => m.month === b.key)?.rides ?? 0, 'ride')}`} initial={months[months.length - 1]?.month} />
      </Section>
      {drops.length > 0 && (
        <Section title="Where you go" note="Top drop-offs, by street address.">
          <HBars rows={drops.map((p) => ({ key: p.name, label: p.name, value: p.rides, shown: count(p.rides, 'ride') }))} />
        </Section>
      )}
      {picks.length > 0 && (
        <Section title="Where you start" note="Top pick-ups, by street address.">
          <HBars rows={picks.map((p) => ({ key: p.name, label: p.name, value: p.rides, shown: count(p.rides, 'ride') }))} />
        </Section>
      )}
      <Section title="When you ride" note="Rides by hour of day.">
        <ReadoutColumns key="hours" bars={hourBars} color="var(--tone-blue)" big={(b) => count(b.value, 'ride')} small={(b) => `${b.key.padStart(2, '0')}:00–${b.key.padStart(2, '0')}:59`} initial={String(hours.indexOf(Math.max(...hours)))} />
      </Section>
      <Section title="Which days" note="Rides by weekday.">
        <ReadoutColumns key="days" bars={dayBars} color="var(--tone-purple)" big={(b) => count(b.value, 'ride')} small={(b) => DAYS[Number(b.key)]} initial={String(weekdays.indexOf(Math.max(...weekdays)))} />
      </Section>
      <AllRides rides={rides} />
      {foreign.map((f) => (
        <p key={f.currency} className="muted small">
          {count(f.rides, 'ride')} paid in {f.currency} ({f.currency} {f.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} in total) {f.rides === 1 ? 'is' : 'are'} listed but left out of the euro totals.
        </p>
      ))}
      <p className="muted small">Data comes from Bolt and Uber receipt emails in Gmail.</p>
    </>
  );
}

function AllRides({ rides }: { rides: Ride[] }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const found = useMemo(() => searchRides(newestFirst(rides), query), [rides, query]);
  return (
    <Section title="All rides" note="Newest first. Search by app, address or date.">
      <input type="search" className="search" placeholder="Search rides" aria-label="Search rides" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(20); }} />
      {found.length === 0 ? (
        <Empty>No rides match.</Empty>
      ) : (
        <ul className="wolt-orders">
          {found.slice(0, limit).map((r) => (
            <li key={r.id}>
              <span className="wolt-when">
                {shortDate(r.date)}
                {r.time && <span className="muted small"> {r.time}</span>}
              </span>
              <span className="wolt-name">
                {PROVIDER_NAME[r.provider]}
                {(r.from || r.to) && (
                  <span className="muted small"> · {placeLabel(r.from) ?? '…'} → {placeLabel(r.to) ?? '…'}</span>
                )}
              </span>
              <span className="wolt-total">{r.fare.toFixed(2)} <span className="muted small">{r.currency}</span></span>
            </li>
          ))}
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
