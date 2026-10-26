import { useMemo, useState } from 'react';
import { today } from '../../lib/format';
import { href } from '../../lib/router';
import { activeFilterCount, categoryCounts, DEFAULT_FILTERS, filterItems, type ClosetFilters } from './closetFilter';
import { FilterSheet } from './FilterSheet';
import { HeartIcon, SlidersIcon } from './icons';
import { ItemThumb } from './ItemThumb';
import { wearCount } from './stats';
import { CATEGORIES, label, type Category, type ClothingItem } from './types';

export function ClothesList({ items }: { items: ClothingItem[] }) {
  const [filters, setFilters] = useState<ClosetFilters>(DEFAULT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const visible = useMemo(() => filterItems(items, filters), [items, filters]);
  const active = activeFilterCount(filters);
  const counts = useMemo(() => categoryCounts(items, filters), [items, filters]);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const tabs = CATEGORIES.filter((c) => counts.get(c) || c === filters.category);
  const pickCategory = (category: Category | 'all') => setFilters({ ...filters, category, subcategory: '' });

  return (
    <>
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
          <div className="search-row">
            <input
              type="search"
              placeholder="Search name, brand, color…"
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            />
            <button
              type="button"
              className="filter-btn"
              aria-label={active ? `Filters, ${active} active` : 'Filters'}
              aria-haspopup="dialog"
              onClick={() => setSheetOpen(true)}
            >
              <SlidersIcon />
              {active > 0 && <span className="filter-count">{active}</span>}
            </button>
          </div>

          <nav className="category-tabs" aria-label="Categories">
            <button aria-pressed={filters.category === 'all'} onClick={() => pickCategory('all')}>
              All <span className="count">{total}</span>
            </button>
            {tabs.map((c) => (
              <button key={c} aria-pressed={filters.category === c} onClick={() => pickCategory(c)}>
                {label(c)} <span className="count">{counts.get(c) ?? 0}</span>
              </button>
            ))}
          </nav>

          {visible.length === 0 ? (
            <p className="muted empty">{filters.favoritesOnly && !filters.query && active === 1 ? 'No favorites yet.' : 'No items match.'}</p>
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

      {sheetOpen && (
        <FilterSheet
          items={items}
          value={filters}
          onApply={(f) => {
            setFilters(f);
            setSheetOpen(false);
          }}
          onClose={() => setSheetOpen(false)}
        />
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
