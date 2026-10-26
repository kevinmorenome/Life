import { useMemo, useState } from 'react';
import { today } from '../../lib/format';
import { href } from '../../lib/router';
import { HeartIcon } from './icons';
import { ItemThumb } from './ItemThumb';
import { lastWorn, wearCount } from './stats';
import { CATEGORIES, STATUSES, label, type Category, type ClothingItem, type Status } from './types';

type Sort = 'recent' | 'name' | 'most-worn' | 'least-recent';

export function ClothesList({ items }: { items: ClothingItem[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [subcategory, setSubcategory] = useState('');
  const [status, setStatus] = useState<Status | 'all'>('active');
  const [sort, setSort] = useState<Sort>('recent');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Everything except the category filter, so the tabs can show counts.
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (status === 'all' || i.status === status) &&
        (!favoritesOnly || i.favorite) &&
        (!q || [i.name, i.brand, i.color, i.subcategory, i.notes, ...(i.tags ?? [])].some((f) => f?.toLowerCase().includes(q))),
    );
  }, [items, query, status, favoritesOnly]);

  const counts = useMemo(() => {
    const c = new Map<Category, number>();
    for (const i of matching) c.set(i.category, (c.get(i.category) ?? 0) + 1);
    return c;
  }, [matching]);

  const inCategory = useMemo(
    () => matching.filter((i) => category === 'all' || i.category === category),
    [matching, category],
  );

  // Sub-categories in use within the chosen category, for the second filter row.
  const subs = useMemo(() => {
    const c = new Map<string, number>();
    if (category === 'all') return c;
    for (const i of inCategory) if (i.subcategory) c.set(i.subcategory, (c.get(i.subcategory) ?? 0) + 1);
    return new Map([...c].sort(([a], [b]) => a.localeCompare(b)));
  }, [inCategory, category]);

  const visible = useMemo(() => {
    const picked = inCategory.filter((i) => !subcategory || i.subcategory === subcategory);
    return picked.sort((a, b) => {
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
  }, [inCategory, subcategory, sort]);

  const pickCategory = (c: Category | 'all') => {
    setCategory(c);
    setSubcategory('');
  };

  const tabs = CATEGORIES.filter((c) => counts.get(c) || c === category);

  return (
    <>
      <h1 className="page-title">Closet</h1>

      {items.length > 0 && !items.some((i) => i.wears.includes(today())) && (
        <a className="card today-prompt" href={href('/clothes/today')}>
          <span>Nothing logged today</span>
          <strong>Log it →</strong>
        </a>
      )}

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
            <div className="search-row">
              <input
                type="search"
                placeholder="Search name, brand, color…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="button"
                className="fav-toggle"
                aria-label="Favorites only"
                aria-pressed={favoritesOnly}
                onClick={() => setFavoritesOnly(!favoritesOnly)}
              >
                <HeartIcon filled={favoritesOnly} />
              </button>
            </div>
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
            <button aria-pressed={category === 'all'} onClick={() => pickCategory('all')}>
              All <span className="count">{matching.length}</span>
            </button>
            {tabs.map((c) => (
              <button key={c} aria-pressed={category === c} onClick={() => pickCategory(c)}>
                {label(c)} <span className="count">{counts.get(c) ?? 0}</span>
              </button>
            ))}
          </nav>

          {subs.size > 0 && (
            <nav className="category-tabs" aria-label="Sub-categories">
              {[...subs].map(([s, n]) => (
                <button key={s} aria-pressed={subcategory === s} onClick={() => setSubcategory(subcategory === s ? '' : s)}>
                  {s} <span className="count">{n}</span>
                </button>
              ))}
            </nav>
          )}

          {visible.length === 0 ? (
            <p className="muted empty">{favoritesOnly && !query && status === 'active' && category === 'all' ? 'No favorites yet.' : 'No items match.'}</p>
          ) : (
            <ul className="closet-grid">
              {visible.map((item) => (
                <li key={item.id}>
                  <a href={href(`/clothes/${item.id}`)} className="closet-tile">
                    <ItemThumb item={item} />
                    {item.favorite && <FavMark />}
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

export function FavMark() {
  return (
    <span className="fav-mark" role="img" aria-label="Favorite">
      <HeartIcon filled />
    </span>
  );
}

/** Brand, times worn (when worn) and non-active status, e.g. "Zara · Worn 3×". */
function tileMeta(item: ClothingItem): string {
  const worn = wearCount(item);
  const parts = [item.brand, worn ? `Worn ${worn}×` : undefined];
  if (item.status !== 'active') parts.push(label(item.status));
  return parts.filter(Boolean).join(' · ') || 'Not worn yet';
}
