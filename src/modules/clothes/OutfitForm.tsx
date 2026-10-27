import { useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { newId } from '../../lib/db';
import { navigate } from '../../lib/router';
import { activeFilterCount, categoryCounts, DEFAULT_FILTERS, filterItems, type ClosetFilters } from './closetFilter';
import { FilterSheet } from './FilterSheet';
import { SlidersIcon } from './icons';
import { ItemThumb } from './ItemThumb';
import { OutfitBoard } from './OutfitBoard';
import { OutfitDetailsStep } from './OutfitDetailsStep';
import { CATEGORIES, label, type Category, type ClothingItem, type Outfit, type Season } from './types';

interface Props {
  existing?: Outfit;
  /** Pieces to start with, e.g. when launched from an item's page. */
  initialItemIds?: string[];
  items: ClothingItem[];
  onSave: (o: Outfit) => Promise<void>;
  /** Runs after saving instead of opening the outfit's page, e.g. to plan it for a day. */
  afterSave?: (o: Outfit) => Promise<void>;
  /** When given (new outfits only), the form offers a date: future days plan the outfit, today/past log it. */
  onApplyDate?: (o: Outfit, date: string) => Promise<void>;
}

export function OutfitForm({ existing, initialItemIds, items, onSave, afterSave, onApplyDate }: Props) {
  const [name, setName] = useState(existing?.name ?? '');
  const [selected, setSelected] = useState<string[]>(existing?.itemIds ?? initialItemIds ?? []);
  // Same filters as the closet; "Selected" is an extra tab that shows just the chosen pieces.
  const [filters, setFilters] = useState<ClosetFilters>(DEFAULT_FILTERS);
  const [showSelected, setShowSelected] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [seasons, setSeasons] = useState<Season[]>(existing?.seasons ?? []);
  const [favorite, setFavorite] = useState(existing?.favorite ?? false);
  const [date, setDate] = useState('');
  const [step, setStep] = useState<'canvas' | 'details'>('canvas');
  const [sheetH, setSheetH] = useState(() => Math.round(window.innerHeight * 0.45));
  const drag = useRef<{ y: number; h: number } | null>(null);

  const pieces = useMemo(
    () => selected.map((id) => items.find((i) => i.id === id)).filter((i): i is ClothingItem => !!i),
    [selected, items],
  );

  const counts = useMemo(() => categoryCounts(items, filters), [items, filters]);
  const total = [...counts.values()].reduce((x, y) => x + y, 0);
  const tabs = CATEGORIES.filter((c) => counts.get(c) || c === filters.category);
  const active = activeFilterCount(filters);

  const visible = useMemo(() => {
    if (!showSelected) return filterItems(items, filters);
    const q = filters.query.trim().toLowerCase();
    return pieces.filter((i) => !q || [i.name, i.brand, i.color, i.subcategory, ...(i.tags ?? [])].some((f) => f?.toLowerCase().includes(q)));
  }, [items, filters, showSelected, pieces]);

  const pickCategory = (c: Category | 'all') => {
    setShowSelected(false);
    setFilters({ ...filters, category: c, subcategory: '' });
  };

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const now = new Date().toISOString();
    const outfit: Outfit = {
      ...existing,
      id: existing?.id ?? newId(),
      name: name.trim() || undefined,
      itemIds: selected,
      seasons: seasons.length || existing?.seasons ? seasons : undefined,
      favorite: favorite || existing?.favorite ? favorite : undefined,
      tags: tags.length || existing?.tags ? tags : undefined,
      wears: existing?.wears ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await onSave(outfit);
    if (date && onApplyDate && !existing) await onApplyDate(outfit, date);
    if (afterSave) await afterSave(outfit);
    else navigate(`/clothes/outfits/${outfit.id}`);
  }

  // Sheet snap points: peek, half, nearly full.
  const snaps = () => [120, Math.round(window.innerHeight * 0.45), Math.round(window.innerHeight * 0.85)];
  const onHandleDown = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: sheetH };
  };
  const onHandleMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const [min, , max] = snaps();
    setSheetH(Math.min(max, Math.max(min, drag.current.h + drag.current.y - e.clientY)));
  };
  const onHandleUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setSheetH((h) => snaps().reduce((best, v) => (Math.abs(v - h) < Math.abs(best - h) ? v : best)));
  };

  if (step === 'details') {
    return (
      <form onSubmit={submit}>
        <OutfitDetailsStep
          title={existing ? 'Edit outfit' : 'New outfit'}
          submitLabel={existing ? 'Save outfit' : 'Create outfit'}
          pieces={pieces}
          name={name}
          onName={setName}
          tags={tags}
          onTags={setTags}
          seasons={seasons}
          onSeasons={setSeasons}
          favorite={favorite}
          onFavorite={setFavorite}
          date={onApplyDate && !existing ? date : undefined}
          onDate={onApplyDate && !existing ? setDate : undefined}
          onBack={() => setStep('canvas')}
          onAddPieces={() => setStep('canvas')}
        />
      </form>
    );
  }

  return (
    <div className="outfit-editor">
      <header className="editor-bar">
        <button type="button" className="icon-action" aria-label="Cancel" onClick={() => history.back()}>
          ✕
        </button>
        <button type="button" className="btn btn-primary" disabled={selected.length === 0} onClick={() => setStep('details')}>
          Next
        </button>
      </header>

      {/* Fixed size: the picker slides over the pieces instead of resizing them. */}
      <div className="editor-canvas" style={{ bottom: snaps()[1] }} aria-label="Outfit canvas">
        {pieces.length ? <OutfitBoard pieces={pieces} large /> : <p className="muted small">Tap pieces below to add them to the canvas.</p>}
      </div>

      <section className="editor-sheet" style={{ height: sheetH }} aria-label="Pieces">
        <div
          className="sheet-handle"
          role="slider"
          aria-label="Resize piece picker"
          aria-valuenow={sheetH}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <span />
        </div>
        <div className="search-row filters">
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
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersIcon />
            {active > 0 && <span className="filter-count">{active}</span>}
          </button>
        </div>
        <nav className="category-tabs" aria-label="Categories">
          <button type="button" aria-pressed={!showSelected && filters.category === 'all'} onClick={() => pickCategory('all')}>
            All <span className="count">{total}</span>
          </button>
          <button type="button" aria-pressed={showSelected} onClick={() => setShowSelected(true)}>
            Selected <span className="count">{selected.length}</span>
          </button>
          {tabs.map((c) => (
            <button key={c} type="button" aria-pressed={!showSelected && filters.category === c} onClick={() => pickCategory(c)}>
              {label(c)} <span className="count">{counts.get(c) ?? 0}</span>
            </button>
          ))}
        </nav>
        <div className="sheet-scroll">
          {visible.length === 0 ? (
            <p className="muted empty">{showSelected ? 'Nothing selected yet.' : 'No items match.'}</p>
          ) : (
            <ul className="closet-grid">
              {visible.map((i) => (
                <li key={i.id}>
                  <button type="button" className="closet-tile pick-tile" aria-pressed={selected.includes(i.id)} onClick={() => toggle(i.id)}>
                    <span className="pick-thumb">
                      <ItemThumb item={i} />
                      <span className="pick-check" aria-hidden>
                        ✓
                      </span>
                    </span>
                    <span className="tile-name">{i.name}</span>
                    <span className="tile-meta">{i.brand ?? label(i.category)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {filtersOpen && (
        <FilterSheet
          items={items}
          value={filters}
          onApply={(f) => {
            setFilters(f);
            setShowSelected(false);
            setFiltersOpen(false);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      )}
    </div>
  );
}
