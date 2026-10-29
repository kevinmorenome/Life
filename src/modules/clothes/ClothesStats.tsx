import { useState, type ReactNode } from 'react';
import { money, shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { Columns, Donut, HBars, Heatmap, PairBars, ReadoutColumns, Ring, TONES, Toggle } from './charts';
import { ItemThumb } from './ItemThumb';
import {
  brandRanking,
  closetUsage,
  colorBreakdown,
  dormantItems,
  formatSpan,
  longevity,
  priceBands,
  repeatRate,
  seasonBalance,
  spendTrend,
  spendVsWear,
  usageRanking,
  valueByCategory,
  wearStreaks,
  wornTogether,
} from './insights';
import { computeStats, daysInCloset, lastWorn, wearCount } from './stats';
import { CATEGORIES, label, type Category, type ClothingItem, type Season } from './types';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'spending', label: 'Spending' },
  { id: 'closet', label: 'Closet' },
  { id: 'wear', label: 'Wear' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function ClothesStatsView({ items, tab: routeTab }: { items: ClothingItem[]; tab?: string }) {
  const now = today();
  const s = computeStats(items, now);
  const tab: TabId = TABS.find((t) => t.id === routeTab)?.id ?? 'overview';

  return (
    <>
      <div className="seg" role="tablist" aria-label="Stats sections" style={{ ['--tabs' as string]: TABS.length }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`stats-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="stats-panel"
            // Replace, so going back from an item page lands on the same tab without a trail of tab switches.
            onClick={() => window.location.replace(href(`/clothes/stats/${t.id}`))}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="stats-panel" role="tabpanel" aria-labelledby={`stats-tab-${tab}`}>
        {tab === 'overview' && (
          <>
            <div className="tiles">
              <Tile value={String(s.activeCount)} label="items in closet" tone={0} />
              <Tile value={money(s.activeValue)} label="closet value" tone={1} />
              <Tile value={String(s.wearsLast30)} label="wears, last 30 days" tone={2} />
              <Tile value={money(s.totalSpent)} label="spent all time" tone={3} />
            </div>
            <UsageCard items={items} now={now} />
            <StreakCard items={items} now={now} />
          </>
        )}

        {tab === 'spending' && (
          <>
            <TrendCard items={items} now={now} />
            <SpendWearCard items={items} />
            <PriceCard items={items} />
            <ItemListCard
              title="Best cost per wear"
              empty="Add prices and log wears to see this."
              rows={s.bestCostPerWear.map(({ item, cpw }) => ({
                item,
                sub: `${money(item.price ?? 0)} · worn ${wearCount(item)}×`,
                value: money(cpw),
                color: 'var(--accent)',
              }))}
            />
          </>
        )}

        {tab === 'closet' && (
          <>
            <CategoryCard items={items} s={s} />
            <ColorsCard items={items} />
            <SeasonCard items={items} />
            <BrandsCard items={items} />
            <LongevityCard items={items} now={now} />
          </>
        )}

        {tab === 'wear' && (
          <>
            <UsedCard items={items} now={now} />
            <DormantCard items={items} now={now} />
            <RepeatCard items={items} />
            <TogetherCard items={items} />
            <ItemListCard
              title={`Never worn (${s.neverWorn.length})`}
              empty="Everything in your closet has been worn. Nice."
              rows={s.neverWorn
                .slice()
                .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
                .map((item) => ({
                  item,
                  sub: `In your closet ${formatSpan(daysInCloset(item, now))}`,
                  value: item.price != null ? money(item.price) : '',
                  color: 'var(--tone-orange)',
                }))}
              limit={5}
            />
          </>
        )}
      </div>
    </>
  );
}

function Tile({ value, label, tone }: { value: string; label: string; tone: number }) {
  return (
    <div className="card tile">
      <span className="stat-value" style={{ color: TONES[tone % TONES.length] }}>
        {value}
      </span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function Section({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
      {note && <p className="muted small chart-note">{note}</p>}
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="muted small">{children}</p>;

/* Closet usage ------------------------------------------------------- */

const WINDOWS = [
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: '365', label: '1y' },
  { value: 'ever', label: 'Ever' },
];

function UsageCard({ items, now }: { items: ClothingItem[]; now: string }) {
  const [win, setWin] = useState('90');
  const u = closetUsage(items, win === 'ever' ? null : Number(win), now);
  return (
    <Section title="Closet usage">
      {u.active === 0 ? (
        <Empty>Add some items to see how much of your closet you wear.</Empty>
      ) : (
        <>
          <Toggle label="Period" options={WINDOWS} value={win} onChange={setWin} />
          <Ring pct={u.pct} caption={`${u.worn} of ${u.active} items worn${win === 'ever' ? '' : ' in this period'}`} />
        </>
      )}
    </Section>
  );
}

/* Purchase trend ----------------------------------------------------- */

function TrendCard({ items, now }: { items: ClothingItem[]; now: string }) {
  const [by, setBy] = useState<'month' | 'year'>('month');
  const [picked, setPicked] = useState<string | null>(null);
  const t = spendTrend(items, by, now);
  const selected = t.buckets.find((b) => b.key === picked) ?? t.buckets[t.buckets.length - 1];
  const bars = t.buckets.map((b) => ({
    key: b.key,
    tick: by === 'month' ? MONTHS[Number(b.key.slice(5)) - 1] : b.key.slice(2),
    value: b.spent,
  }));
  const name = (key: string) =>
    by === 'year' ? key : new Date(key + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <Section
      title="Purchase trend"
      note={t.undated > 0 ? `${money(t.undated)} on items without a purchase date isn’t shown.` : undefined}
    >
      {t.total === 0 && t.undated === 0 ? (
        <Empty>Add prices and purchase dates to see your spending over time.</Empty>
      ) : (
        <>
          <Toggle
            label="Group by"
            options={[
              { value: 'month', label: 'Months' },
              { value: 'year', label: 'Years' },
            ]}
            value={by}
            onChange={(v) => {
              setBy(v);
              setPicked(null);
            }}
          />
          <div className="readout">
            <strong>{money(selected.spent)}</strong>
            <span className="muted">
              {name(selected.key)} · {selected.count} {selected.count === 1 ? 'item' : 'items'}
            </span>
          </div>
          <Columns
            bars={bars}
            selected={selected.key}
            onSelect={setPicked}
            color="var(--tone-blue)"
            describe={(b) => `${name(b.key)}: ${money(b.value)}`}
          />
        </>
      )}
    </Section>
  );
}

/* By category -------------------------------------------------------- */

function CategoryCard({ items, s }: { items: ClothingItem[]; s: ReturnType<typeof computeStats> }) {
  const [mode, setMode] = useState<'count' | 'value'>('count');
  if (s.byCategory.length === 0) return null;
  const value = valueByCategory(items);
  const rows =
    mode === 'count'
      ? s.byCategory.map((c) => ({ key: c.category, label: label(c.category), value: c.count, shown: String(c.count) }))
      : value.map((c) => ({
          key: c.category,
          label: label(c.category),
          value: c.value,
          shown: money(c.value),
          sub: `${c.count} ${c.count === 1 ? 'item' : 'items'}`,
        }));
  return (
    <Section title="By category">
      <Toggle
        label="Show"
        options={[
          { value: 'count', label: 'Items' },
          { value: 'value', label: 'Value' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {rows.length === 0 ? <Empty>Add prices to see what each category is worth.</Empty> : <HBars rows={rows} color="var(--tone-purple)" />}
    </Section>
  );
}

/* Colours ------------------------------------------------------------ */

function ColorsCard({ items }: { items: ClothingItem[] }) {
  const colors = colorBreakdown(items);
  return (
    <Section title="Colours">
      {colors.length === 0 ? (
        <Empty>Add colours to your items to see the mix.</Empty>
      ) : (
        <Donut slices={colors.map((c) => ({ name: c.name, value: c.count }))} />
      )}
    </Section>
  );
}

/* Most / least used -------------------------------------------------- */

function UsedCard({ items, now }: { items: ClothingItem[]; now: string }) {
  const [order, setOrder] = useState<'most' | 'least'>('most');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const present = CATEGORIES.filter((c) => items.some((i) => i.status === 'active' && i.category === c));
  const active = category === 'all' || present.includes(category) ? category : 'all';
  const ranked = usageRanking(items, active, order, now);
  const top = Math.max(1, ...ranked.map(wearCount));

  return (
    <Section title="Usage">
      <Toggle
        label="Order"
        options={[
          { value: 'most', label: 'Most used' },
          { value: 'least', label: 'Least used' },
        ]}
        value={order}
        onChange={setOrder}
      />
      {present.length > 1 && (
        <div className="chips chart-scroll" role="group" aria-label="Category">
          {(['all', ...present] as const).map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={c === active} onClick={() => setCategory(c)}>
              {c === 'all' ? 'All' : label(c)}
            </button>
          ))}
        </div>
      )}
      {ranked.length === 0 ? (
        <Empty>{order === 'most' ? 'Log some wears to see your favourites.' : 'Nothing here yet.'}</Empty>
      ) : (
        <ul className="item-rows">
          {ranked.map((i) => (
            <ItemRow
              key={i.id}
              item={i}
              sub={lastWorn(i) ? `Last worn ${shortDate(lastWorn(i)!)}` : wearCount(i) ? 'No recent wears logged' : 'Never worn'}
              value={`${wearCount(i)}×`}
              fill={order === 'most' ? wearCount(i) / top : undefined}
              color={order === 'most' ? 'var(--accent)' : 'var(--tone-orange)'}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}

function ItemRow({ item, sub, value, fill, color, tint }: { item: ClothingItem; sub?: string; value: string; fill?: number; color?: string; tint?: string }) {
  return (
    <li>
      <a className="item-row" href={href(`/clothes/${item.id}`)}>
        <ItemThumb item={item} />
        <span className="item-row-text">
          <span className="item-row-name">{item.name}</span>
          {sub && <span className="muted small">{sub}</span>}
          {fill != null && (
            <span className="bar-track item-row-bar">
              <span className="bar-fill" style={{ width: `${fill * 100}%`, background: color }} />
            </span>
          )}
        </span>
        <span className="item-row-value" style={tint ? { color: tint } : undefined}>
          {value}
        </span>
      </a>
    </li>
  );
}

/* Streaks ------------------------------------------------------------ */

function StreakCard({ items, now }: { items: ClothingItem[]; now: string }) {
  const st = wearStreaks(items, now);
  const logged = st.weeks.some((w) => w.some((c) => c.on));
  return (
    <Section title="Streaks" note="Days with at least one wear logged.">
      {!logged ? (
        <Empty>Log what you wear and your streaks will build up here.</Empty>
      ) : (
        <>
          <div className="longevity-head streak-head">
            <span className="stat">
              <span className="stat-value" style={{ color: 'var(--tone-orange)' }}>
                {st.current} {st.current === 1 ? 'day' : 'days'}
              </span>
              <span className="stat-label">current streak</span>
            </span>
            <span className="stat">
              <span className="stat-value" style={{ color: 'var(--tone-purple)' }}>
                {st.longest} {st.longest === 1 ? 'day' : 'days'}
              </span>
              <span className="stat-label">longest streak</span>
            </span>
            <span className="stat">
              <span className="stat-value" style={{ color: 'var(--accent)' }}>
                {Math.round((st.daysThisYear / st.daysElapsed) * 100)}%
              </span>
              <span className="stat-label">
                of {new Date(now + 'T00:00:00').getFullYear()} logged ({st.daysThisYear} days)
              </span>
            </span>
          </div>
          <Heatmap weeks={st.weeks} />
        </>
      )}
    </Section>
  );
}

/* Spend vs wear ------------------------------------------------------- */

function SpendWearCard({ items }: { items: ClothingItem[] }) {
  const rows = spendVsWear(items);
  const hasMoney = rows.some((r) => r.spent > 0);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <Section title="Spend vs wear" note="A category with a big spend share but a small wear share isn’t paying off.">
      {!hasMoney ? (
        <Empty>Add prices to compare what you spend with what you wear.</Empty>
      ) : (
        <PairBars
          names={['Share of spend', 'Share of wears']}
          colors={['var(--tone-blue)', 'var(--accent)']}
          rows={rows.map((r) => ({
            key: r.category,
            label: label(r.category),
            a: r.spendShare,
            b: r.wearShare,
            aText: pct(r.spendShare),
            bText: pct(r.wearShare),
          }))}
        />
      )}
    </Section>
  );
}

/* Price distribution ---------------------------------------------------- */

function PriceCard({ items }: { items: ClothingItem[] }) {
  const p = priceBands(items);
  const total = p.bands.reduce((a, b) => a + b.count, 0);
  return (
    <Section
      title="Price distribution"
      note={p.unpriced > 0 ? `${p.unpriced} ${p.unpriced === 1 ? 'item has' : 'items have'} no price and ${p.unpriced === 1 ? 'isn’t' : 'aren’t'} shown.` : undefined}
    >
      {total === 0 ? (
        <Empty>Add prices to see how your closet spreads across price ranges.</Empty>
      ) : (
        <>
          <p className="muted small chart-note chart-top">
            Typical item: <strong className="strong">{money(p.median ?? 0)}</strong>
          </p>
          <ReadoutColumns
            color="var(--tone-orange)"
            initial={p.bands.reduce((best, b) => (b.count > best.count ? b : best)).label}
            bars={p.bands.map((b) => ({ key: b.label, tick: b.label, value: b.count }))}
            big={(b) => `${b.value} ${b.value === 1 ? 'item' : 'items'}`}
            small={(b) => `Priced ${b.key.replace('<', 'under ').replace('+', ' and up').replace('–', ' to ')}`}
          />
        </>
      )}
    </Section>
  );
}

/* Season balance ------------------------------------------------------- */

const SEASON_COLOR: Record<Season, string> = {
  spring: 'var(--tone-lime)',
  summer: 'var(--tone-orange)',
  fall: 'var(--tone-purple)',
  winter: 'var(--tone-blue)',
};

function SeasonCard({ items }: { items: ClothingItem[] }) {
  const { seasons, unset } = seasonBalance(items);
  const any = seasons.some((s) => s.count > 0);
  return (
    <Section
      title="Season balance"
      note={unset > 0 ? `${unset} ${unset === 1 ? 'item has' : 'items have'} no season set. Items for several seasons count in each.` : 'Items for several seasons count in each.'}
    >
      {!any ? (
        <Empty>Set seasons on your items to see how balanced your closet is.</Empty>
      ) : (
        <HBars
          rows={seasons.map((s) => ({
            key: s.season,
            label: label(s.season),
            value: s.count,
            shown: String(s.count),
            color: SEASON_COLOR[s.season],
          }))}
        />
      )}
    </Section>
  );
}

/* Dormant items --------------------------------------------------------- */

const DORMANT = [
  { value: '90', label: '90d' },
  { value: '180', label: '180d' },
  { value: '365', label: '1y' },
];

function DormantCard({ items, now }: { items: ClothingItem[]; now: string }) {
  const [days, setDays] = useState('180');
  const [expanded, setExpanded] = useState(false);
  const list = dormantItems(items, Number(days), now);
  const shown = expanded ? list : list.slice(0, 5);
  return (
    <Section title={`Dormant (${list.length})`} note="Pieces you used to wear but haven’t lately. Good candidates to wear again, sell or donate.">
      <Toggle
        label="Not worn for"
        options={DORMANT}
        value={days}
        onChange={(v) => {
          setDays(v);
          setExpanded(false);
        }}
      />
      {list.length === 0 ? (
        <Empty>Nothing has been idle that long. Nice rotation.</Empty>
      ) : (
        <ul className="item-rows">
          {shown.map(({ item, since }) => (
            <ItemRow
              key={item.id}
              item={item}
              sub={`Last worn ${shortDate(lastWorn(item)!)}`}
              value={formatSpan(since)}
              tint="var(--tone-orange)"
            />
          ))}
        </ul>
      )}
      {shown.length < list.length && (
        <button type="button" className="btn btn-ghost show-all" onClick={() => setExpanded(true)}>
          Show all {list.length}
        </button>
      )}
    </Section>
  );
}

/* Repeat rate ----------------------------------------------------------- */

function RepeatCard({ items }: { items: ClothingItem[] }) {
  const r = repeatRate(items);
  return (
    <Section title="Repeat rate" note="How long until a piece comes back after you last wore it.">
      {r.total === 0 ? (
        <Empty>Wear a piece more than once on logged days to see how often it comes back.</Empty>
      ) : (
        <>
          <p className="muted small chart-note chart-top">
            Typical gap: <strong className="strong">{r.medianGap} {r.medianGap === 1 ? 'day' : 'days'}</strong>
          </p>
          <ReadoutColumns
            color="var(--tone-purple)"
            initial={r.buckets.reduce((best, b) => (b.count > best.count ? b : best)).label}
            bars={r.buckets.map((b) => ({ key: b.label, tick: b.label.replace(' d', ''), value: b.count }))}
            big={(b) => `${Math.round((b.value / r.total) * 100)}% of re-wears`}
            small={(b) => `Back within ${b.key}`.replace('Back within 31+ d', 'Back after 31+ d')}
          />
        </>
      )}
    </Section>
  );
}

/* Worn together ------------------------------------------------------ */

function TogetherCard({ items }: { items: ClothingItem[] }) {
  const pairs = wornTogether(items);
  return (
    <Section title="Worn together" note="Pieces worn on the same day, at least twice.">
      {pairs.length === 0 ? (
        <Empty>Wear the same pieces together more than once and they’ll show up here.</Empty>
      ) : (
        <ul className="item-rows">
          {pairs.map(({ a, b, days }) => (
            <li key={a.id + b.id}>
              <div className="item-row">
                <span className="pair-thumbs">
                  <ItemThumb item={a} />
                  <ItemThumb item={b} />
                </span>
                <span className="item-row-text">
                  <a className="item-row-name" href={href(`/clothes/${a.id}`)}>{a.name}</a>
                  <a className="item-row-name" href={href(`/clothes/${b.id}`)}>{b.name}</a>
                </span>
                <span className="item-row-value">{days}×</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* Brands ------------------------------------------------------------- */

function BrandsCard({ items }: { items: ClothingItem[] }) {
  const brands = brandRanking(items);
  return (
    <Section title="Favourite brands" note="Ranked by how often you wear them.">
      {brands.length === 0 ? (
        <Empty>Add brands to your items to see which ones you reach for.</Empty>
      ) : (
        <HBars
          color="var(--tone-lime)"
          rows={brands.map((b) => ({
            key: b.brand,
            label: b.brand,
            value: b.wears,
            shown: `${b.wears}×`,
            sub: `${b.items} ${b.items === 1 ? 'item' : 'items'}${b.spent ? ` · ${money(b.spent)}` : ''}`,
          }))}
        />
      )}
    </Section>
  );
}

/* Longevity ---------------------------------------------------------- */

function LongevityCard({ items, now }: { items: ClothingItem[]; now: string }) {
  const l = longevity(items, now);
  const note = [
    l.unknown > 0 ? `${l.unknown} ${l.unknown === 1 ? 'item has' : 'items have'} no purchase date and ${l.unknown === 1 ? 'is' : 'are'} left out.` : '',
    'Items that left your closet before this update have no leaving date, so they’re left out of the average.',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Section title="Longevity" note={note}>
      {l.longest.length === 0 ? (
        <Empty>Add purchase dates to see how long you keep things.</Empty>
      ) : (
        <>
          <div className="longevity-head">
            <span className="stat">
              <span className="stat-value" style={{ color: 'var(--tone-purple)' }}>
                {l.avgRetiredDays != null ? formatSpan(l.avgRetiredDays) : '—'}
              </span>
              <span className="stat-label">average before an item leaves</span>
            </span>
            <span className="stat">
              <span className="stat-value" style={{ color: 'var(--tone-blue)' }}>{formatSpan(l.longest[0].days)}</span>
              <span className="stat-label">longest kept</span>
            </span>
          </div>
          <ul className="item-rows">
            {l.longest.map((k) => (
              <ItemRow key={k.item.id} item={k.item} sub={k.ongoing ? 'Still in your closet' : label(k.item.status)} value={formatSpan(k.days)} />
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

/* Plain lists (kept from the original stats) ------------------------- */

function ItemListCard({
  title,
  empty,
  rows,
  limit,
}: {
  title: string;
  empty: string;
  rows: { item: ClothingItem; sub: string; value: string; color: string }[];
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = limit && !expanded ? rows.slice(0, limit) : rows;
  return (
    <Section title={title}>
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className="item-rows">
          {shown.map(({ item, sub, value, color }) => (
            <ItemRow key={item.id} item={item} sub={sub} value={value} tint={color} />
          ))}
        </ul>
      )}
      {shown.length < rows.length && (
        <button type="button" className="btn btn-ghost show-all" onClick={() => setExpanded(true)}>
          Show all {rows.length}
        </button>
      )}
    </Section>
  );
}
