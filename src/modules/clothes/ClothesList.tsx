import { useMemo, useState } from 'react';
import { href } from '../../lib/router';
import { today } from '../../lib/format';
import { ClothesTabs } from './ClothesTabs';
import { ItemThumb } from './ItemThumb';
import { lastWorn } from './stats';
import { CATEGORIES, STATUSES, label, type Category, type ClothingItem, type Status } from './types';
import { withWear } from './wear';

type Sort = 'recent' | 'name' | 'most-worn' | 'least-recent';

interface Props {
  items: ClothingItem[];
  onSave: (item: ClothingItem) => Promise<void>;
}

export function ClothesList({ items, onSave }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [status, setStatus] = useState<Status | 'all'>('active');
  const [sort, setSort] = useState<Sort>('recent');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter(
      (i) =>
        (category === 'all' || i.category === category) &&
        (status === 'all' || i.status === status) &&
        (!q || [i.name, i.brand, i.color, i.notes].some((f) => f?.toLowerCase().includes(q))),
    );
    return filtered.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'most-worn':
          return b.wears.length - a.wears.length;
        case 'least-recent':
          return (lastWorn(a) ?? '').localeCompare(lastWorn(b) ?? '');
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
  }, [items, query, category, status, sort]);

  const date = today();

  return (
    <>
      <div className="page-head">
        <h1>Clothes</h1>
        <a className="btn btn-primary" href={href('/clothes/new')}>
          + Add
        </a>
      </div>
      <ClothesTabs active="closet" />

      {items.length === 0 ? (
        <div className="empty">
          <p>Your closet is empty.</p>
          <a className="btn btn-primary" href={href('/clothes/new')}>
            Add your first item
          </a>
        </div>
      ) : (
        <>
          <div className="filters">
            <input
              type="search"
              placeholder="Search name, brand, color…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="filter-row">
              <select value={category} onChange={(e) => setCategory(e.target.value as Category | 'all')}>
                <option value="all">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {label(c)}
                  </option>
                ))}
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value as Status | 'all')}>
                <option value="all">Any status</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="recent">Newest</option>
                <option value="name">Name</option>
                <option value="most-worn">Most worn</option>
                <option value="least-recent">Longest unworn</option>
              </select>
            </div>
          </div>

          <p className="muted small">
            {visible.length} of {items.length} items
          </p>

          <ul className="item-grid">
            {visible.map((item) => {
              const woreToday = item.wears.includes(date);
              return (
                <li key={item.id} className="card item-card">
                  <a href={href(`/clothes/${item.id}`)} className="item-link">
                    <ItemThumb item={item} />
                    <div className="item-text">
                      <strong>{item.name}</strong>
                      <span className="muted small">
                        {[item.brand, item.color].filter(Boolean).join(' · ') || label(item.category)}
                      </span>
                      <span className="muted small">
                        Worn {item.wears.length}×{item.status !== 'active' && ` · ${label(item.status)}`}
                      </span>
                    </div>
                  </a>
                  <button
                    className="btn btn-small"
                    disabled={woreToday}
                    onClick={() => onSave(withWear(item, date))}
                  >
                    {woreToday ? 'Worn today ✓' : 'Wore today'}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
