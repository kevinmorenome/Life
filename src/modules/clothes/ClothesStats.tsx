import { useState, type ReactNode } from 'react';
import { money, shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { Columns, Donut, HBars, Ring, TONES, Toggle } from './charts';
import { ItemThumb } from './ItemThumb';
import {
  brandRanking,
  closetUsage,
  colorBreakdown,
  formatSpan,
  longevity,
  spendTrend,
  usageRanking,
  valueByCategory,
  wornTogether,
} from './insights';
import { computeStats, daysInCloset, lastWorn, wearCount } from './stats';
import { CATEGORIES, label, type Category, type ClothingItem } from './types';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export function ClothesStatsView({ items }: { items: ClothingItem[] }) {
  const now = today();
  const s = computeStats(items, now);

  return (
    <>
      <div className="tiles">
        <Tile value={String(s.activeCount)} label="items in closet" tone={0} />
        <Tile value={money(s.activeValue)} label="closet value" tone={1} />
        <Tile value={String(s.wearsLast30)} label="wears, last 30 days" tone={2} />
        <Tile value={money(s.totalSpent)} label="spent all time" tone={3} />
      </div>

      <UsageCard items={items} now={now} />
      <TrendCard items={items} now={now} />
      <CategoryCard items={items} s={s} />
      <ColorsCard items={items} />
      <UsedCard items={items} now={now} />
      <TogetherCard items={items} />
      <BrandsCard items={items} />
      <LongevityCard items={items} now={now} />

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
