import { useMemo, useState } from 'react';
import { ThumbDownIcon, ThumbUpIcon } from '../../icons';
import { href } from '../../lib/router';
import { shortDate, today } from '../../lib/format';
import { Empty, HBars, ReadoutColumns, Section, Toggle, type Bar } from '../clothes/charts';
import { filterLines, itemSpendPerMonth, repeatPrices, topDishes, topVenues, unratedDishes } from './dishes';
import { OrderItems } from './OrderItems';
import { useTakeoutData } from './useTakeoutData';
import { count, eur, placeName } from './wolt';

const monthLabel = (ym: string) => new Date(ym + '-01T00:00:00Z').toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** What you order: top dishes and venues from the item lines, with filters, price changes and what is still to rate. */
export function WhatIEat() {
  const data = useTakeoutData();
  const [query, setQuery] = useState('');
  const [venue, setVenue] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [by, setBy] = useState<'count' | 'spend'>('count');
  const [limit, setLimit] = useState(15);
  const now = today();
  const lines = useMemo(() => filterLines(data.lines, { query, venue, from: from || undefined, to: to || undefined }), [data.lines, query, venue, from, to]);
  const dishes = useMemo(() => topDishes(lines, by), [lines, by]);
  const venues = useMemo(() => topVenues(lines), [lines]);
  const allVenues = useMemo(() => topVenues(data.lines).map((v) => v.venue), [data.lines]);
  const months = useMemo(() => itemSpendPerMonth(lines, now.slice(0, 7)), [lines, now]);
  const prices = useMemo(() => repeatPrices(lines).slice(0, 8), [lines]);
  const toRate = useMemo(() => unratedDishes(data.lines, data.verdicts).slice(0, 5), [data.lines, data.verdicts]);

  if (data.loading) return <p className="muted">Loading…</p>;
  if (data.details.length === 0) {
    return (
      <Section title="Nothing here yet">
        <Empty>Item lines come from the PDF attached to each Wolt email. Ask Claude to add them: “attach the items to my Wolt orders”. Then your dishes show up here.</Empty>
      </Section>
    );
  }
  const covered = new Set(data.lines.map((l) => l.orderId)).size;
  const pieces = lines.reduce((s, l) => s + l.qty, 0);
  const monthBars: Bar[] = months.map((m, i) => ({ key: m.month, tick: i % 6 === 0 ? monthLabel(m.month) : '', value: m.spent }));

  return (
    <>
      <Section hero title="What I eat" value={String(pieces)} sentence={`pieces ordered across ${count(new Set(lines.map((l) => l.orderId)).size, 'order')}${dishes[0] ? `. Your top dish is ${dishes[0].dish}` : ''}.`} note={`Item lines exist for ${covered} of ${data.orders.length} takeout orders.`}>
        <div className="item-filters">
          <input type="search" className="search" placeholder="Search dishes" aria-label="Search dishes" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(15); }} />
          <select aria-label="Venue" value={venue} onChange={(e) => setVenue(e.target.value)}>
            <option value="">All venues</option>
            {allVenues.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <label className="muted small">From <input type="date" value={from} max={to || now} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="muted small">To <input type="date" value={to} min={from} max={now} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      </Section>

      {toRate.length > 0 && !query && !venue && !from && !to && (
        <Section title="Did you like these?" note="Tap a thumb under the order, or just tell Claude.">
          <ul className="digest-list">
            {toRate.map((u) => (
              <li key={u.key}>
                <span>{u.dish}</span><br /><span className="muted small">{u.venue} · {shortDate(u.lastOrdered)}</span>
                <span className="item-actions">
                  <button type="button" className="icon-btn" aria-label={`Liked ${u.raw}`} onClick={() => data.rate(u.venue, u.raw, { verdict: 'liked' })}>
                    <ThumbUpIcon />
                  </button>
                  <button type="button" className="icon-btn" aria-label={`Didn’t like ${u.raw}`} onClick={() => data.rate(u.venue, u.raw, { verdict: 'disliked' })}>
                    <ThumbDownIcon />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Top dishes" value={dishes[0]?.dish} sentence={dishes[0] ? `${count(dishes[0].count, 'piece')}, ${eur(dishes[0].spent)} in all.` : undefined} tone={1} note="Spellings you grouped count as one dish. Spend is euro orders only.">
        <Toggle label="Rank by" value={by} onChange={setBy} options={[{ value: 'count', label: 'By count' }, { value: 'spend', label: 'By spend' }]} />
        {dishes.length === 0 ? <Empty>No dishes match.</Empty> : <HBars rows={dishes.slice(0, 10).map((d) => ({ key: d.dish, label: d.dish, value: by === 'count' ? d.count : d.spent, shown: by === 'count' ? `${d.count}×` : eur(d.spent), sub: d.venues.join(', ') }))} />}
      </Section>

      <Section title="Favourite venues" value={venues[0]?.venue} sentence={venues[0] ? `${count(venues[0].orders, 'order')}${venues[0].topDish ? `, mostly ${venues[0].topDish}` : ''}.` : undefined} tone={3} note="Tap a venue to see everything you ever ordered there.">
        <ul className="digest-list venue-links">
          {venues.slice(0, 10).map((v) => (
            <li key={v.venue}>
              <a href={href(`/wolt/venue/${encodeURIComponent(v.venue)}`)}>{v.venue}</a> <span className="muted small">· {count(v.orders, 'order')} · {eur(v.spent)} on items</span>
            </li>
          ))}
        </ul>
      </Section>

      {months.length > 0 && (
        <Section title="Spend on items per month" tone={2} note="What the dishes cost, without delivery fees. Euro orders only.">
          <ReadoutColumns bars={monthBars} big={(b) => eur(b.value)} small={(b) => new Date(b.key + '-01T00:00:00Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })} initial={months[months.length - 1].month} />
        </Section>
      )}

      {prices.length > 0 && (
        <Section title="Price changes" note="Dishes you ordered at least 3 times whose price moved.">
          <ul className="digest-list">
            {prices.map((p) => (
              <li key={p.dish}>
                {p.dish} <span className="muted small">· {eur(p.first)} → {eur(p.latest)} ({p.change > 0 ? '+' : ''}{p.change.toFixed(2)}) over {count(p.times, 'order')}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Recent orders" note="Newest first, with what was in them.">
        {[...new Set(lines.map((l) => l.orderId))].slice(0, limit).map((id) => {
          const order = data.orders.find((o) => o.id === id)!;
          return (
            <div key={id} className="order-block">
              <p>
                <strong>{placeName(order.restaurant)}</strong> <span className="muted small">{shortDate(order.date)}{order.time ? ` ${order.time}` : ''}</span>
              </p>
              <OrderItems order={order} detail={data.detailOf.get(id)} data={data} />
            </div>
          );
        })}
        {new Set(lines.map((l) => l.orderId)).size > limit && <button type="button" className="btn" onClick={() => setLimit((l) => l + 15)}>Show more</button>}
      </Section>
    </>
  );
}
