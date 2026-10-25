import { useMemo, useState } from 'react';
import { href } from '../../lib/router';
import { ClothesTabs } from './ClothesTabs';
import { ItemThumb } from './ItemThumb';
import { lastWorn, wearCount } from './stats';
import { CATEGORIES, STATUSES, label, type Category, type ClothingItem, type Status } from './types';

type Sort = 'recent' | 'name' | 'most-worn' | 'least-recent';

export function ClothesList({ items }: { items: ClothingItem[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [status, setStatus] = useState<Status | 'all'>('active');
  const [sort, setSort] = useState<Sort>('recent');

  // Everything except the category filter, so the tabs can show counts.
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (status === 'all' || i.status === status) &&
        (!q || [i.name, i.brand, i.color, i.notes, ...(i.tags ?? [])].some((f) => f?.toLowerCase().includes(q))),
    );
  }, [items, query, status]);

  const counts = useMemo(() => {
    const c = new Map<Category, number>();
    for (const i of matching) c.set(i.category, (c.get(i.category) ?? 0) + 1);
    return c;
  }, [matching]);

  const visible = useMemo(() => {
    const inCategory = matching.filter((i) => category === 'all' || i.category === category);
    return inCategory.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'most-worn':
          return wearCount(b) - wearCount(a);
        case 'least-recent':
          return (lastWorn(a) ?? '').localeCompare(lastWorn(b) ?? '');
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
  }, [matching, category, sort]);

  const tabs = CATEGORIES.filter((c) => counts.get(c) || c === category);

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
            <div className="filter-row filter-row-pair">
              <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="recent">Recently added</option>
                <option value="name">Name</option>
                <option value="most-worn">Most worn</option>
                <option value="least-recent">Longest unworn</option>
              </select>
              <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Status | 'all')}>
                <option value="all">Any status</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <nav className="category-tabs" aria-label="Categories">
            <button aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
              All <span className="count">{matching.length}</span>
            </button>
            {tabs.map((c) => (
              <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>
                {label(c)} <span className="count">{counts.get(c) ?? 0}</span>
              </button>
            ))}
          </nav>

          {visible.length === 0 ? (
            <p className="muted empty">No items match.</p>
          ) : (
            <ul className="closet-grid">
              {visible.map((item) => (
                <li key={item.id}>
                  <a href={href(`/clothes/${item.id}`)} className="closet-tile">
                    <ItemThumb item={item} />
                    <span className="tile-name">{item.name}</span>
                    <span className="tile-meta">{tileMeta(item)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

/** Brand, times worn (when worn) and non-active status, e.g. "Zara · Worn 3×". */
function tileMeta(item: ClothingItem): string {
  const worn = wearCount(item);
  const parts = [item.brand, worn ? `Worn ${worn}×` : undefined];
  if (item.status !== 'active') parts.push(label(item.status));
  return parts.filter(Boolean).join(' · ') || 'Not worn yet';
}
