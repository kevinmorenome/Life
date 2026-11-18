import { useMemo, useState } from 'react';
import { shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { OrderItems } from './OrderItems';
import { itemSpendSplit, topDishes } from './dishes';
import { useTakeoutData } from './useTakeoutData';
import { Empty, HBars, ReadoutColumns, Section, Tile, type Bar } from '../clothes/charts';
import type { WoltOrder } from './types';
import { useTakeoutOrders } from './useTakeoutOrders';
import { SERVICE_NAMES, count, eur, byService, hourCounts, monthlySpend, newestFirst, otherCurrencies, searchOrders, serviceOf, summarize, topPlaces } from './wolt';

const eur0 = (n: number) => `€${Math.round(n).toLocaleString()}`;
const monthLabel = (ym: string, style: 'short' | 'long' = 'short') => new Date(ym + '-01T00:00:00Z').toLocaleDateString(undefined, { month: style, year: '2-digit', timeZone: 'UTC' });

export function WoltStatsRoute() {
  const { items, loading } = useTakeoutOrders();
  const now = today();
  if (loading) return <p className="muted">Loading…</p>;
  if (items.length === 0) {
    return (
      <Section title="Nothing yet">
        <Empty>Ask Claude to read your Wolt, Bolt or Uber Eats takeout receipts and add the orders; the numbers build up here.</Empty>
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
  const services = useMemo(() => byService(orders), [orders]);
  const foreign = useMemo(() => otherCurrencies(orders), [orders]);

  const monthBars: Bar[] = months.map((m, i) => ({ key: m.month, tick: i % 6 === 0 ? monthLabel(m.month) : '', value: m.spent }));
  const hourBars: Bar[] = hours.map((value, h) => ({ key: String(h), tick: h % 4 === 0 ? String(h).padStart(2, '0') : '', value }));

  return (
    <>
      <Section
        hero
        title="Takeout, all time"
        value={eur0(s.spent)}
        sentence={`spent on ${count(s.orders, 'order')}${services.length === 1 ? ` through ${SERVICE_NAMES[services[0].service]}` : ''}${s.since ? ` since ${new Date(s.since + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''}${s.topPlace ? `. Your top place is ${s.topPlace}` : ''}.`}
      >
        <div className="tiles">
          <Tile value={String(s.orders)} label="orders, all time" tone={0} />
          <Tile value={eur(s.average)} label="average order" tone={2} />
          <Tile value={eur0(s.yearSpent)} label={`spent in ${year} (${count(s.yearOrders, 'order')})`} tone={3} />
        </div>
      </Section>
      {services.length > 1 && (
        <Section title="By app" value={SERVICE_NAMES[services[0].service]} sentence={`is the app you use most, ${count(services[0].orders, 'order')} and ${eur0(services[0].spent)}.`} tone={1} note="Orders and euro spend per delivery app.">
          <HBars rows={services.map((r) => ({ key: r.service, label: SERVICE_NAMES[r.service], value: r.spent, shown: `${count(r.orders, 'order')} · ${eur0(r.spent)}` }))} />
        </Section>
      )}
      <Section title="Spend per month" value={eur0(months[months.length - 1]?.spent ?? 0)} sentence={`spent in ${monthLabel(months[months.length - 1]?.month ?? now.slice(0, 7), 'long')}, the latest month.`} tone={1} note="Euro orders, by the month they were delivered. Months without orders show as empty.">
        <ReadoutColumns bars={monthBars} big={(b) => eur(b.value)} small={(b) => `${monthLabel(b.key, 'long')} · ${count(months.find((m) => m.month === b.key)?.orders ?? 0, 'order')}`} initial={months[months.length - 1]?.month} />
      </Section>
      <Section title="Where you order most" value={places[0]?.name} sentence={places[0] ? `${count(places[0].orders, 'order')}, ${eur0(places[0].spent)} in all.` : undefined} tone={3} note="Top 10 places by total spend, branches combined.">
        <HBars rows={places.map((p) => ({ key: p.name, label: p.name, value: p.spent, shown: `${count(p.orders, 'order')} · ${eur0(p.spent)}` }))} />
      </Section>
      <Section title="When you order" value={`${String(hours.indexOf(Math.max(...hours))).padStart(2, '0')}:00`} sentence="is the hour you order most often." tone={2} note="Orders by hour of day.">
        <ReadoutColumns key="hours" bars={hourBars} color="var(--tone-orange)" big={(b) => count(b.value, 'order')} small={(b) => `${b.key.padStart(2, '0')}:00–${b.key.padStart(2, '0')}:59`} initial={String(hours.indexOf(Math.max(...hours)))} />
      </Section>
      <WhatYouEat orders={orders} />
      <AllOrders orders={orders} />
      {foreign.map((f) => (
        <p key={f.currency} className="muted small">
          {count(f.orders, 'order')} paid in {f.currency} ({f.currency} {f.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} in total) {f.orders === 1 ? 'is' : 'are'} listed but left out of the euro totals.
        </p>
      ))}
      <p className="muted small">Data comes from Wolt, Bolt Food and Uber Eats receipt emails in Gmail. Grocery orders are in the food log, not here. Item lines come from the PDF attached to each Wolt email (open an order to see them).</p>
    </>
  );
}

function AllOrders({ orders }: { orders: WoltOrder[] }) {
  const data = useTakeoutData();
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const found = useMemo(() => searchOrders(newestFirst(orders), query), [orders, query]);
  return (
    <Section title="All orders" note="Newest first. Search by restaurant, app or date.">
      <input type="search" className="search" placeholder="Search orders" aria-label="Search orders" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(20); }} />
      {found.length === 0 ? (
        <Empty>No orders match.</Empty>
      ) : (
        <ul className="wolt-orders">
          {found.slice(0, limit).map((o) => (
            <li key={o.id} className="wolt-order">
              <span className="wolt-when">
                {shortDate(o.date)}
                {o.time && <span className="muted small"> {o.time}</span>}
              </span>
              <button type="button" className="wolt-name wolt-toggle" aria-expanded={openId === o.id} onClick={() => setOpenId(openId === o.id ? null : o.id)}>
                {o.restaurant}{serviceOf(o) !== 'wolt' && <span className="muted small"> · {SERVICE_NAMES[serviceOf(o)]}</span>}
                {data.detailOf.has(o.id) && <span className="muted small"> · {data.detailOf.get(o.id)!.items.length} items</span>}
              </button>
              <span className="wolt-total">{o.total.toFixed(2)} <span className="muted small">{o.currency}</span></span>
              {openId === o.id && <div className="wolt-items"><OrderItems order={o} detail={data.detailOf.get(o.id)} data={data} /></div>}
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

/** What you actually ate, from the item lines: your top dishes and how much of the item spend was for someone else. Needs items to be attached. */
function WhatYouEat({ orders }: { orders: WoltOrder[] }) {
  const data = useTakeoutData();
  const dishes = useMemo(() => topDishes(data.lines).slice(0, 5), [data.lines]);
  const split = useMemo(() => itemSpendSplit(orders, data.details, data.shares), [orders, data.details, data.shares]);
  if (data.loading) return null;
  if (data.details.length === 0) {
    return (
      <p className="small">
        <a href={href('/wolt')}>What I eat →</a> <span className="muted">your dishes will show here once Claude attaches the items of your Wolt orders.</span>
      </p>
    );
  }
  const covered = new Set(data.lines.map((l) => l.orderId)).size;
  return (
    <Section
      title="What you eat"
      value={dishes[0]?.dish}
      sentence={dishes[0] ? `is the dish you ordered most, ${count(Math.round(dishes[0].count * 2) / 2, 'piece')} across ${count(dishes[0].orders, 'order')}.` : undefined}
      tone={3}
      note={`Only what was yours, from ${count(data.details.length, 'order')} with item lines${split.others > 0 ? `. ${eur(split.others)} of the ${eur(split.all)} spent on items in those orders was for someone else` : ''}.`}
    >
      <HBars rows={dishes.map((d) => ({ key: d.dish, label: d.dish, value: d.count, shown: `${Math.round(d.count * 2) / 2}×`, sub: d.venues.join(', ') }))} />
      {covered > 0 && (
        <p className="small">
          <a href={href('/wolt')}>All dishes, venues and what you liked →</a>
        </p>
      )}
    </Section>
  );
}
