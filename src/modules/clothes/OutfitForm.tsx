import { useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { newId } from '../../lib/db';
import { navigate } from '../../lib/router';
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
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all' | 'selected'>('all');
  const [subcategory, setSubcategory] = useState('');
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

  // Everything except the category filter, so the tabs can show counts.
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (i.status === 'active' || selected.includes(i.id)) &&
        (!q || [i.name, i.brand, i.color, i.subcategory, i.notes, ...(i.tags ?? [])].some((f) => f?.toLowerCase().includes(q))),
    );
  }, [items, query, selected]);

  const counts = useMemo(() => {
    const c = new Map<Category, number>();
    for (const i of matching) c.set(i.category, (c.get(i.category) ?? 0) + 1);
    return c;
  }, [matching]);

  const inCategory = useMemo(
    () =>
      matching.filter((i) =>
        category === 'all' ? true : category === 'selected' ? selected.includes(i.id) : i.category === category,
      ),
    [matching, category, selected],
  );

  const subs = useMemo(() => {
    const c = new Map<string, number>();
    if (category === 'all' || category === 'selected') return c;
    for (const i of inCategory) if (i.subcategory) c.set(i.subcategory, (c.get(i.subcategory) ?? 0) + 1);
    return new Map([...c].sort(([a], [b]) => a.localeCompare(b)));
  }, [inCategory, category]);

  const visible = useMemo(
    () =>
      inCategory
        .filter((i) => !subcategory || i.subcategory === subcategory)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [inCategory, subcategory],
  );

  const pickCategory = (c: Category | 'all' | 'selected') => {
    setCategory(c);
    setSubcategory('');
  };

  const tabs = CATEGORIES.filter((c) => counts.get(c) || c === category);

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
        <div className="filters">
          <input type="search" placeholder="Search name, brand, color…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <nav className="category-tabs" aria-label="Categories">
          <button type="button" aria-pressed={category === 'all'} onClick={() => pickCategory('all')}>
            All <span className="count">{matching.length}</span>
          </button>
          <button type="button" aria-pressed={category === 'selected'} onClick={() => pickCategory('selected')}>
            Selected <span className="count">{selected.length}</span>
          </button>
          {tabs.map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => pickCategory(c)}>
              {label(c)} <span className="count">{counts.get(c) ?? 0}</span>
            </button>
          ))}
        </nav>
        {subs.size > 0 && (
          <nav className="category-tabs" aria-label="Sub-categories">
            {[...subs].map(([sub, n]) => (
              <button key={sub} type="button" aria-pressed={subcategory === sub} onClick={() => setSubcategory(subcategory === sub ? '' : sub)}>
                {sub} <span className="count">{n}</span>
              </button>
            ))}
          </nav>
        )}
        <div className="sheet-scroll">
          {visible.length === 0 ? (
            <p className="muted empty">{category === 'selected' ? 'Nothing selected yet.' : 'No items match.'}</p>
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
    </div>
  );
}
