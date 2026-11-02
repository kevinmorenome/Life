import { useMemo, useState } from 'react';
import { shortDate, today } from '../../lib/format';
import { useCollection } from '../../lib/useCollection';
import { Empty, HBars, ReadoutColumns, Section, Tile, type Bar } from '../clothes/charts';
import type { WoltOrder } from './types';
import { hourCounts, monthlySpend, newestFirst, otherCurrencies, searchOrders, summarize, topPlaces } from './wolt';

const eur = (n: number) => `€${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const eur0 = (n: number) => `€${Math.round(n).toLocaleString()}`;
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const monthLabel = (ym: string, style: 'short' | 'long' = 'short') => new Date(ym + '-01T00:00:00Z').toLocaleDateString(undefined, { month: style, year: '2-digit', timeZone: 'UTC' });

export function WoltStatsRoute() {
  const { items, loading } = useCollection<WoltOrder>('woltorders');
  const now = today();
  if (loading) return <p className="muted">Loading…</p>;
  if (items.length === 0) {
    return (
      <Section title="Nothing yet">
        <Empty>Ask Claude to read your Wolt takeout receipts and add the orders; the numbers build up here.</Empty>
      </Section>
    );
  }
  return <Loaded orders={items} now={now} />;
}

function Loaded({ orders, now }: { orders: WoltOrder[]; now: string }) {
  const year = now.slice(0, 4);
  const s = useMemo(() => summarize(orders, year), [orders, year]);
  const months = useMemo(() => monthlySpend(orders, now.slice(0, 7)), [orders, now]);
  const places = useMemo(() => topPlaces(orders).slice(0, 10), [orders]);
  const hours = useMemo(() => hourCounts(orders), [orders]);
  const foreign = useMemo(() => otherCurrencies(orders), [orders]);

  const monthBars: Bar[] = months.map((m, i) => ({ key: m.month, tick: i % 6 === 0 ? monthLabel(m.month) : '', value: m.spent }));
  const hourBars: Bar[] = hours.map((value, h) => ({ key: String(h), tick: h % 4 === 0 ? String(h).padStart(2, '0') : '', value }));

  return (
    <>
      <p className="muted">
        You have ordered takeout <strong>{s.orders}</strong> {s.orders === 1 ? 'time' : 'times'} through Wolt
        {s.since ? <> since <strong>{new Date(s.since + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</strong></> : null}, spending <strong>{eur0(s.spent)}</strong>
        {s.topPlace ? <>. Your top place is <strong>{s.topPlace}</strong></> : null}.
      </p>
      <div className="tiles">
        <Tile value={String(s.orders)} label="orders, all time" tone={0} />
        <Tile value={eur0(s.spent)} label="spent (EUR)" tone={1} />
        <Tile value={eur(s.average)} label="average order" tone={2} />
        <Tile value={eur0(s.yearSpent)} label={`spent in ${year} (${count(s.yearOrders, 'order')})`} tone={3} />
      </div>
      <Section title="Spend per month" note="Euro orders, by the month they were delivered. Months without orders show as empty.">
        <ReadoutColumns bars={monthBars} big={(b) => eur(b.value)} small={(b) => `${monthLabel(b.key, 'long')} · ${count(months.find((m) => m.month === b.key)?.orders ?? 0, 'order')}`} initial={months[months.length - 1]?.month} />
      </Section>
      <Section title="Where you order most" note="Top 10 places by total spend, branches combined.">
        <HBars rows={places.map((p) => ({ key: p.name, label: p.name, value: p.spent, shown: `${count(p.orders, 'order')} · ${eur0(p.spent)}` }))} />
      </Section>
      <Section title="When you order" note="Orders by hour of day.">
        <ReadoutColumns key="hours" bars={hourBars} color="var(--tone-orange)" big={(b) => count(b.value, 'order')} small={(b) => `${b.key.padStart(2, '0')}:00–${b.key.padStart(2, '0')}:59`} initial={String(hours.indexOf(Math.max(...hours)))} />
      </Section>
      <AllOrders orders={orders} />
      {foreign.map((f) => (
        <p key={f.currency} className="muted small">
          {count(f.orders, 'order')} paid in {f.currency} ({f.currency} {f.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} in total) {f.orders === 1 ? 'is' : 'are'} listed but left out of the euro totals.
        </p>
      ))}
      <p className="muted small">Data comes from Wolt receipt emails in Gmail. Grocery orders are in the food log, not here. Item lines are only in the PDF attachments, so they are not tracked.</p>
    </>
  );
}

function AllOrders({ orders }: { orders: WoltOrder[] }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const found = useMemo(() => searchOrders(newestFirst(orders), query), [orders, query]);
  return (
    <Section title="All orders" note="Newest first. Search by restaurant or date.">
      <input type="search" className="search" placeholder="Search orders" aria-label="Search orders" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(20); }} />
      {found.length === 0 ? (
        <Empty>No orders match.</Empty>
      ) : (
        <ul className="wolt-orders">
          {found.slice(0, limit).map((o) => (
            <li key={o.id}>
              <span className="wolt-when">
                {shortDate(o.date)}
                {o.time && <span className="muted small"> {o.time}</span>}
              </span>
              <span className="wolt-name">{o.restaurant}</span>
              <span className="wolt-total">{o.total.toFixed(2)} <span className="muted small">{o.currency}</span></span>
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
