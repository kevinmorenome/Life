import { useMemo, useState } from 'react';
import { money, shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { useCollection } from '../../lib/useCollection';
import { Empty, HBars, ReadoutColumns, Section, Tile, Toggle, type Bar } from '../clothes/charts';
import { depositSummary, monthlyFoodSpend, rebuyStats, savedByOffers, shoppingHabits, spendByCategory, spendByStore, wasteSummary, weeklyFoodSpend } from './foodStats';
import { isWoltTakeoutReceipt } from '../wolt/fromReceipts';
import { cheaperElsewhere } from './prices';
import { productSummaries } from './products';
import type { FoodProduct, FoodReceipt, StockEvent } from './types';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'prices', label: 'Prices' },
  { id: 'waste', label: 'Waste' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const monthLabel = (ym: string, style: 'short' | 'long' = 'short') => new Date(ym + '-01T00:00:00Z').toLocaleDateString(undefined, style === 'long' ? { month: 'long', year: 'numeric', timeZone: 'UTC' } : { month: 'short', year: '2-digit', timeZone: 'UTC' });
const pct = (share: number) => `${Math.round(share * 100)}%`;
const days = (n?: number) => (n ? (n === 7 ? 'weekly' : `every ${n} days`) : '');

export function FoodStatsRoute({ tab: routeTab }: { tab?: string }) {
  const all = useCollection<FoodReceipt>('foodreceipts');
  // Wolt takeout still filed as a food receipt is counted under Takeout, not here.
  const receipts = { ...all, items: useMemo(() => all.items.filter((r) => !isWoltTakeoutReceipt(r)), [all.items]) };
  const products = useCollection<FoodProduct>('foodproducts');
  const events = useCollection<StockEvent>('foodstock');
  const tab: TabId = TABS.find((t) => t.id === routeTab)?.id ?? 'overview';

  if (receipts.loading || products.loading || events.loading) return <p className="muted">Loading…</p>;
  if (receipts.items.length === 0) {
    return (
      <Section title="Nothing yet">
        <Empty>Add grocery receipts (by hand, or ask Claude to read them) and the numbers build up here.</Empty>
      </Section>
    );
  }
  return (
    <>
      <div className="seg seg-sub" role="tablist" aria-label="Food stats sections" style={{ ['--tabs' as string]: TABS.length }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`food-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="food-panel"
            // Replace, so going back doesn't walk through every tab switch.
            onClick={() => window.location.replace(href(`/stats/food/${t.id}`))}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="food-panel" role="tabpanel" aria-labelledby={`food-tab-${tab}`}>
        {tab === 'overview' && <Overview receipts={receipts.items} records={products.items} />}
        {tab === 'prices' && <Prices receipts={receipts.items} records={products.items} />}
        {tab === 'waste' && <Waste receipts={receipts.items} records={products.items} events={events.items} />}
      </div>
    </>
  );
}

function Overview({ receipts, records }: { receipts: FoodReceipt[]; records: FoodProduct[] }) {
  const now = today();
  const [by, setBy] = useState<'month' | 'week'>('month');
  const habits = useMemo(() => shoppingHabits(receipts), [receipts]);
  const saved = useMemo(() => savedByOffers(receipts), [receipts]);
  const periods = useMemo(() => (by === 'month' ? monthlyFoodSpend(receipts, now.slice(0, 7), 12) : weeklyFoodSpend(receipts, now, 12)), [receipts, now, by]);
  const stores = useMemo(() => spendByStore(receipts), [receipts]);
  const categories = useMemo(() => spendByCategory(receipts, records), [receipts, records]);
  const rebuys = useMemo(() => rebuyStats(productSummaries(receipts, records)), [receipts, records]);

  const thisMonth = monthlyFoodSpend(receipts, now.slice(0, 7), 1)[0];
  const label = (key: string) => (by === 'month' ? monthLabel(key, 'long') : `Week of ${shortDate(key)}`);
  const bars: Bar[] = periods.map((p, i) => ({ key: p.key, tick: by === 'month' ? (i % 2 === 0 ? monthLabel(p.key) : '') : i % 3 === 0 ? shortDate(p.key) : '', value: p.spent }));

  return (
    <>
      <div className="tiles">
        <Tile value={money(thisMonth.spent)} label={`spent on food this month (${count(thisMonth.trips, 'trip')})`} tone={0} />
        <Tile value={money(habits.basket)} label="average basket" tone={1} />
        <Tile value={String(habits.perWeek)} label="shopping trips a week" tone={2} />
        <Tile value={money(saved.saved)} label={`saved by offers (${count(saved.offerLines, 'line')})`} tone={3} />
      </div>
      <Section title="Spend" note="Food and drink, without deposits and bags.">
        <Toggle label="Period" options={[{ value: 'month', label: 'Months' }, { value: 'week', label: 'Weeks' }]} value={by} onChange={setBy} />
        <ReadoutColumns key={by} bars={bars} big={(b) => money(b.value)} small={(b) => `${label(b.key)} · ${count(periods.find((p) => p.key === b.key)?.trips ?? 0, 'trip')}`} initial={periods[periods.length - 1]?.key} />
      </Section>
      <Section title="Where you shop" note="Total food spend per store, with the average basket.">
        <HBars rows={stores.map((s) => ({ key: s.store, label: s.store, value: s.spent, shown: money(s.spent), sub: `${count(s.trips, 'trip')} · ${money(s.average)} on average` }))} />
      </Section>
      <Section title="What you spend it on">
        <HBars color="var(--tone-blue)" rows={categories.map((c) => ({ key: c.key, label: c.label, value: c.spent, shown: money(c.spent) }))} />
      </Section>
      {rebuys.length > 0 && (
        <Section title="What you rebuy most" note="Tap a product for its prices and history.">
          <ul className="hbars">
            {rebuys.map((r) => (
              <li key={r.productId}>
                <a className="hbar-head" href={href(`/food/product/${r.productId}`)}>
                  <span className="hbar-label">{r.name}</span>
                  <span className="hbar-value">{r.purchases}×</span>
                </a>
                <span className="hbar-sub">{[days(r.everyDays), `${money(r.spent)} in all`].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function Prices({ receipts, records }: { receipts: FoodReceipt[]; records: FoodProduct[] }) {
  const now = today();
  const list = useMemo(() => cheaperElsewhere(productSummaries(receipts, records), now), [receipts, records, now]);
  const yearly = list.reduce((s, x) => s + x.yearly, 0);
  return (
    <>
      <Section
        title="Cheaper elsewhere"
        note="Compares the shelf price (without offers) at the store you bought it at last with the other stores you have bought it at in the last six months. It needs the same product from two stores, so it fills in as you shop around."
      >
        {list.length === 0 ? (
          <Empty>Nothing cheaper elsewhere yet. When the same product has been bought at two stores, the cheaper one shows here.</Empty>
        ) : (
          <>
            <p className="muted">
              Buying these where they were cheapest would have saved about <strong>{money(yearly)}</strong> over the last year.
            </p>
            <ul className="game-list">
              {list.map(({ product, comparison, perUnit, yearly: y }) => (
                <li key={product.id}>
                  <a className="game-row" href={href(`/food/product/${product.id}`)}>
                    <strong>
                      {product.name} · {comparison.cheaper!.store} {money(perUnit)} cheaper
                    </strong>
                    <span className="muted small">
                      {money(comparison.usual.regular)} at {comparison.usual.store} → {money(comparison.cheaper!.regular)} at {comparison.cheaper!.store} ({pct(comparison.savingPct!)}) · about {money(y)} a year
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </>
  );
}

function Waste({ receipts, records, events }: { receipts: FoodReceipt[]; records: FoodProduct[]; events: StockEvent[] }) {
  const now = today();
  const waste = useMemo(() => wasteSummary(productSummaries(receipts, records), events, receipts, now.slice(0, 7), 12), [receipts, records, events, now]);
  const deposits = useMemo(() => depositSummary(receipts), [receipts]);
  const bars: Bar[] = waste.perMonth.map((m, i) => ({ key: m.key, tick: i % 2 === 0 ? monthLabel(m.key) : '', value: m.value }));
  return (
    <>
      <div className="tiles">
        <Tile value={money(waste.value)} label="thrown away, at average prices" tone={0} />
        <Tile value={String(waste.times)} label="times thrown away" tone={1} />
        <Tile value={waste.share === undefined ? '–' : pct(waste.share)} label="of what you spent on food" tone={2} />
        <Tile value={money(deposits.paid)} label={`deposits paid (${count(deposits.lines, 'line')})`} tone={3} />
      </div>
      {waste.times === 0 ? (
        <Section title="Food waste">
          <Empty>Nothing thrown away yet. Tap “Threw out” on a product in Stock (or tell Claude) and it is counted here, valued at what that product usually costs.</Empty>
        </Section>
      ) : (
        <>
          <Section title="Thrown away per month" note="Valued at the product’s average price per unit. Mistakes can be fixed by a newer count; thrown-away history stays.">
            <ReadoutColumns bars={bars} color="var(--tone-orange)" big={(b) => money(b.value)} small={(b) => monthLabel(b.key, 'long')} initial={[...waste.perMonth].reverse().find((m) => m.value > 0)?.key ?? waste.perMonth[waste.perMonth.length - 1]?.key} />
          </Section>
          <Section title="What goes in the bin most">
            <HBars color="var(--tone-orange)" rows={waste.top.map((w) => ({ key: w.productId, label: w.name, value: w.value, shown: money(w.value), sub: count(w.times, 'time') }))} />
          </Section>
        </>
      )}
      <p className="muted small">
        Deposits are only the fees charged as their own lines on a receipt; deposits already inside the product prices are not separate. Empties you return are not tracked yet, so this is what was paid, not what is waiting to be returned.
      </p>
    </>
  );
}
