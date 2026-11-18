import { useMemo } from 'react';
import { shortDate } from '../../lib/format';
import { Empty, HBars, Section } from '../clothes/charts';
import { filterLines, topDishes, topVenues } from './dishes';
import { OrderItems } from './OrderItems';
import { useTakeoutData } from './useTakeoutData';
import { eur, placeName } from './wolt';


/** Everything ever ordered at one venue (branches combined) and how often. */
export function VenueView({ venue }: { venue: string }) {
  const data = useTakeoutData();
  const name = placeName(venue);
  const lines = useMemo(() => filterLines(data.lines, { venue: name }).filter((l) => l.venue.toLowerCase() === name.toLowerCase()), [data.lines, name]);
  const dishes = useMemo(() => topDishes(lines), [lines]);
  const orders = useMemo(() => data.orders.filter((o) => placeName(o.restaurant).toLowerCase() === name.toLowerCase()).sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`)), [data.orders, name]);
  if (data.loading) return <p className="muted">Loading…</p>;
  const v = topVenues(lines)[0];
  return (
    <>
      <Section hero title={name} value={String(orders.length)} sentence={`${orders.length === 1 ? 'order' : 'orders'}${v ? `, ${eur(v.spent)} on items` : ''}${orders.length ? `. First order ${shortDate(orders[orders.length - 1].date)}` : ''}.`} />
      <Section title="What you ordered here" note="Pieces, most ordered first.">
        {dishes.length === 0 ? <Empty>No item lines for this venue yet.</Empty> : <HBars rows={dishes.map((d) => ({ key: d.dish, label: d.dish, value: d.count, shown: `${d.count}×`, sub: `${d.orders === 1 ? 'one order' : `${d.orders} orders`} · last ${shortDate(d.last)}` }))} />}
      </Section>
      <Section title="Orders">
        {orders.map((o) => (
          <div key={o.id} className="order-block">
            <p>
              <strong>{shortDate(o.date)}</strong> <span className="muted small">{o.time ?? ''} · {o.total.toFixed(2)} {o.currency}</span>
            </p>
            <OrderItems order={o} detail={data.detailOf.get(o.id)} data={data} />
          </div>
        ))}
      </Section>
    </>
  );
}
