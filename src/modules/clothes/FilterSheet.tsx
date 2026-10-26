import { useEffect, useState, type ReactNode } from 'react';
import { swatchCss } from './colors';
import { ChevronDownIcon, CloseIcon, HeartIcon } from './icons';
import {
  colorOptions,
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

/** A filter section whose heading toggles its content. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className={open ? undefined : 'collapsed'}>
      <button type="button" className="section-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <h3>{title}</h3>
        <ChevronDownIcon />
      </button>
      {open && children}
    </section>
  );
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
  const colors = colorOptions(items, draft);
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
          <Section title="Sub-category">
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
          </Section>
        )}

        {colors.length > 0 && (
          <Section title="Colors">
            <div className="chips color-grid">
              {colors.map((c) => {
                const on = draft.colors.some((d) => d.toLowerCase() === c.toLowerCase());
                return (
                  <button
                    key={c}
                    type="button"
                    className="chip chip-color"
                    aria-pressed={on}
                    onClick={() => set({ colors: on ? draft.colors.filter((d) => d.toLowerCase() !== c.toLowerCase()) : [...draft.colors, c] })}
                  >
                    <span className="dot" style={swatchCss(c) ? { background: swatchCss(c)! } : undefined} aria-hidden />
                    {c}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        <Section title="Sort by">
          <div className="chips">
            {SORTS.map((s) => (
              <button key={s.value} type="button" className="chip" aria-pressed={draft.sort === s.value} onClick={() => set({ sort: s.value })}>
                {s.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Status">
          <div className="chips">
            {(['all', ...STATUSES] as const).map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={draft.status === s} onClick={() => set({ status: s })}>
                {s === 'all' ? 'Any' : label(s)}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Favorites">
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
        </Section>
      </div>

      <div className="sticky-actions filter-apply">
        <button type="button" className="btn btn-primary btn-block" onClick={() => onApply(draft)}>
          Show {result} {result === 1 ? 'item' : 'items'}
        </button>
      </div>
    </div>
  );
}
