import { useMemo, useState, type FormEvent } from 'react';
import { newId } from '../../lib/db';
import { today } from '../../lib/format';
import { navigate } from '../../lib/router';
import { ItemThumb } from './ItemThumb';
import { OutfitBoard } from './OutfitBoard';
import { CATEGORIES, label, type Category, type ClothingItem, type Outfit } from './types';

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
  const [tagDraft, setTagDraft] = useState('');
  const [date, setDate] = useState('');

  const pieces = useMemo(
    () => selected.map((id) => items.find((i) => i.id === id)).filter((i): i is ClothingItem => !!i),
    [selected, items],
  );

  function addTag() {
    const t = tagDraft.trim();
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags([...tags, t]);
    setTagDraft('');
  }

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

  return (
    <form className="form" onSubmit={submit}>
      <h1>{existing ? 'Edit outfit' : 'New outfit'}</h1>
      <label className="field">
        <span>Name (optional)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday dinner" />
      </label>

      <div className="outfit-preview" aria-label="Outfit preview">
        {pieces.length ? <OutfitBoard pieces={pieces} large /> : <p className="muted small">Pick pieces below to see your outfit.</p>}
      </div>

      <div className="field">
        <span>Tags</span>
        <ul className="chips tag-list">
          {tags.map((t) => (
            <li key={t} className="chip chip-static chip-color">
              {t}
              <button type="button" className="chip-x" aria-label={`Remove tag ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <input
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
          placeholder="Add a tag (dinner, work…)"
          aria-label="New tag"
        />
      </div>

      {onApplyDate && !existing && (
        <label className="field">
          <span>Date (optional)</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {date && <small className="muted">{date > today() ? 'Will be planned for this day.' : 'Will be logged as worn that day.'}</small>}
        </label>
      )}

      <section className="field" aria-label="Pieces">
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
            {[...subs].map(([s, n]) => (
              <button key={s} type="button" aria-pressed={subcategory === s} onClick={() => setSubcategory(subcategory === s ? '' : s)}>
                {s} <span className="count">{n}</span>
              </button>
            ))}
          </nav>
        )}

        {visible.length === 0 ? (
          <p className="muted empty">{category === 'selected' ? 'Nothing selected yet.' : 'No items match.'}</p>
        ) : (
          <ul className="closet-grid">
            {visible.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  className="closet-tile pick-tile"
                  aria-pressed={selected.includes(i.id)}
                  onClick={() => toggle(i.id)}
                >
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
      </section>

      <div className="form-actions sticky-actions">
        <button type="button" className="btn btn-ghost" onClick={() => history.back()}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={selected.length === 0}>
          Save outfit
        </button>
      </div>
    </form>
  );
}
