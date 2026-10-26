import { useEffect, useState } from 'react';
import { CloseIcon, HeartIcon } from './icons';
import {
  DEFAULT_FILTERS,
  filterItems,
  SORTS,
  subcategoryCounts,
  type ClosetFilters,
} from './closetFilter';
import { STATUSES, label, type ClothingItem } from './types';

interface Props {
  items: ClothingItem[];
  value: ClosetFilters;
  onApply: (filters: ClosetFilters) => void;
  onClose: () => void;
}

/** Full-screen filter page: edits a draft, and Apply (showing the result count) commits it. */
export function FilterSheet({ items, value, onApply, onClose }: Props) {
  const [draft, setDraft] = useState(value);
  const set = (patch: Partial<ClosetFilters>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const subs = subcategoryCounts(items, draft);
  const result = filterItems(items, draft).length;

  return (
    <div className="filter-page" role="dialog" aria-label="Filters">
      <header className="filter-head">
        <button type="button" className="icon-btn" aria-label="Close filters" onClick={onClose}>
          <CloseIcon />
        </button>
        <h2>Filters</h2>
        <button type="button" className="btn btn-ghost" onClick={() => setDraft({ ...DEFAULT_FILTERS, query: value.query })}>
          Reset
        </button>
      </header>

      <div className="filter-body">
        {subs.size > 0 && (
          <section>
            <h3>Sub-category</h3>
            <div className="chips">
              {[...subs].map(([s, n]) => (
                <button
                  key={s}
                  type="button"
                  className="chip"
                  aria-pressed={draft.subcategory === s}
                  onClick={() => set({ subcategory: draft.subcategory === s ? '' : s })}
                >
                  {s} · {n}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3>Sort by</h3>
          <div className="chips">
            {SORTS.map((s) => (
              <button key={s.value} type="button" className="chip" aria-pressed={draft.sort === s.value} onClick={() => set({ sort: s.value })}>
                {s.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Status</h3>
          <div className="chips">
            {(['all', ...STATUSES] as const).map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={draft.status === s} onClick={() => set({ status: s })}>
                {s === 'all' ? 'Any' : label(s)}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Favorites</h3>
          <div className="chips">
            <button
              type="button"
              className="chip chip-icon"
              aria-pressed={draft.favoritesOnly}
              onClick={() => set({ favoritesOnly: !draft.favoritesOnly })}
            >
              <HeartIcon filled={draft.favoritesOnly} /> Favorites only
            </button>
          </div>
        </section>
      </div>

      <div className="sticky-actions filter-apply">
        <button type="button" className="btn btn-primary btn-block" onClick={() => onApply(draft)}>
          Show {result} {result === 1 ? 'item' : 'items'}
        </button>
      </div>
    </div>
  );
}
