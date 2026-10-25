import { useState } from 'react';
import { money, today } from '../../lib/format';
import { href } from '../../lib/router';
import { computeStats, wearCount } from './stats';
import { label, type ClothingItem } from './types';

export function ClothesStatsView({ items }: { items: ClothingItem[] }) {
  const s = computeStats(items, today());
  const maxCat = Math.max(1, ...s.byCategory.map((c) => c.count));

  return (
    <>
      <h1 className="page-title">Stats</h1>

      <div className="tiles">
        <Tile value={String(s.activeCount)} label="items in closet" />
        <Tile value={money(s.activeValue)} label="closet value" />
        <Tile value={String(s.wearsLast30)} label="wears, last 30 days" />
        <Tile value={money(s.totalSpent)} label="spent all time" />
      </div>

      {s.byCategory.length > 0 && (
        <section className="card">
          <h2>By category</h2>
          <ul className="bars">
            {s.byCategory.map(({ category, count }) => (
              <li key={category}>
                <span className="bar-label">{label(category)}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(count / maxCat) * 100}%` }} />
                </span>
                <span className="bar-value">{count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ItemListCard
        title="Most worn"
        empty="Log some wears to see favorites."
        rows={s.mostWorn.map((i) => ({ item: i, value: `${wearCount(i)}×` }))}
      />
      <ItemListCard
        title="Best cost per wear"
        empty="Add prices and log wears to see this."
        rows={s.bestCostPerWear.map(({ item, cpw }) => ({ item, value: money(cpw) }))}
      />
      <ItemListCard
        title={`Never worn (${s.neverWorn.length})`}
        empty="Everything in your closet has been worn. Nice."
        rows={s.neverWorn
          .slice()
          .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
          .map((i) => ({ item: i, value: i.price != null ? money(i.price) : '' }))}
        limit={10}
      />
    </>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="card tile">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function ItemListCard({
  title,
  empty,
  rows,
  limit,
}: {
  title: string;
  empty: string;
  rows: { item: ClothingItem; value: string }[];
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = limit && !expanded ? rows.slice(0, limit) : rows;
  return (
    <section className="card">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ul className="rank-list">
          {shown.map(({ item, value }) => (
            <li key={item.id}>
              <a href={href(`/clothes/${item.id}`)}>{item.name}</a>
              <span className="muted">{value}</span>
            </li>
          ))}
        </ul>
      )}
      {shown.length < rows.length && (
        <button className="btn btn-ghost btn-small" onClick={() => setExpanded(true)}>
          Show all {rows.length}
        </button>
      )}
    </section>
  );
}
