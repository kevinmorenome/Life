import { useMemo, useState } from 'react';
import { today } from '../../lib/format';
import { EyeIcon, EyeOffIcon } from '../../icons';
import { href } from '../../lib/router';
import { activeFilterCount, categoryCounts, DEFAULT_FILTERS, filterItems, type ClosetFilters } from './closetFilter';
import { ClosetTabs } from './ClosetTabs';
import { FilterSheet } from './FilterSheet';
import { withStatusFor } from './bulk';
import { CheckIcon, CloseIcon, HeartIcon, SlidersIcon, SparkleIcon } from './icons';
import { ItemThumb } from './ItemThumb';
import { wearCount } from './stats';
import { CATEGORIES, label, type Category, type ClothingItem } from './types';

// Kept at module level so filters survive opening an item and coming back (the list unmounts).
let savedFilters: ClosetFilters = DEFAULT_FILTERS;

export function ClothesList({ items, onSave }: { items: ClothingItem[]; onSave: (item: ClothingItem) => Promise<void> }) {
  const [filters, setFiltersState] = useState<ClosetFilters>(savedFilters);
  const setFilters = (next: ClosetFilters) => {
    savedFilters = next;
    setFiltersState(next);
  };
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const visible = useMemo(() => filterItems(items, filters), [items, filters]);
  const active = activeFilterCount(filters);
  const counts = useMemo(() => categoryCounts(items, filters), [items, filters]);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const tabs = CATEGORIES.filter((c) => counts.get(c) || c === filters.category);
  const pickCategory = (category: Category | 'all') => setFilters({ ...filters, category, subcategory: '' });

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const chosen = visible.filter((i) => selected.has(i.id));
  const bringBack = chosen.length > 0 && chosen.every((i) => i.status === 'storage');
  async function applyStatus() {
    const changed = withStatusFor(chosen, selected, bringBack ? 'active' : 'storage', new Date().toISOString());
    await Promise.all(changed.map(onSave));
    stopSelecting();
  }

  const toReview = items.filter((i) => i.needsReview).length;

  return (
    <>
      <ClosetTabs active="closet" />
      {toReview > 0 && (
        <a className="card today-prompt" href={href('/clothes/review')}>
          <span>{toReview === 1 ? '1 new item to review' : `${toReview} new items to review`}</span>
          <strong>Review →</strong>
        </a>
      )}
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
            <button
              type="button"
              className="filter-btn"
              aria-label={selecting ? 'Cancel selecting' : 'Select items'}
              aria-pressed={selecting}
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            >
              {selecting ? <CloseIcon /> : <CheckIcon />}
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
            <p className="muted empty">{filters.reviewOnly && !filters.query && active === 1 ? 'Nothing left to review.' : filters.favoritesOnly && !filters.query && active === 1 ? 'No favorites yet.' : 'No items match.'}</p>
          ) : (
            <ul className="closet-grid">
              {visible.map((item) => (
                <li key={item.id}>
                  {selecting ? (
                    <button
                      type="button"
                      className="closet-tile tile-select"
                      aria-pressed={selected.has(item.id)}
                      aria-label={`Select ${item.name}`}
                      onClick={() => toggle(item.id)}
                    >
                      <ItemThumb item={item} />
                      <span className="select-mark" aria-hidden="true">
                        {selected.has(item.id) && <CheckIcon />}
                      </span>
                      <span className="tile-name">{item.name}</span>
                      <span className="tile-meta">{tileMeta(item)}</span>
                    </button>
                  ) : (
                    <a href={href(`/clothes/${item.id}`)} className="closet-tile">
                      <ItemThumb item={item} />
                      {item.favorite && <FavMark />}
                      {item.needsReview && <ReviewMark />}
                      <span className="tile-name">{item.name}</span>
                      <span className="tile-meta">{tileMeta(item)}</span>
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {selecting && (
        <div className="select-bar" role="toolbar" aria-label="Selection">
          <span className="small">{chosen.length} selected</span>
          <button
            type="button"
            className="btn btn-primary select-action"
            disabled={chosen.length === 0}
            aria-label={bringBack ? 'Bring back selected items' : 'Put away selected items'}
            onClick={applyStatus}
          >
            {bringBack ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        </div>
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

/** Corner marker on items added automatically (e.g. from a receipt) that still need checking. */
export function ReviewMark() {
  return (
    <span className="review-mark" role="img" aria-label="Needs review">
      <SparkleIcon />
    </span>
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
