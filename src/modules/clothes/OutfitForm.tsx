import { useMemo, useState, type FormEvent } from 'react';
import { newId } from '../../lib/db';
import { navigate } from '../../lib/router';
import { ItemThumb } from './ItemThumb';
import { label, type ClothingItem, type Outfit } from './types';

interface Props {
  existing?: Outfit;
  items: ClothingItem[];
  onSave: (o: Outfit) => Promise<void>;
}

export function OutfitForm({ existing, items, onSave }: Props) {
  const [name, setName] = useState(existing?.name ?? '');
  const [selected, setSelected] = useState<string[]>(existing?.itemIds ?? []);
  const [query, setQuery] = useState('');

  const choices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => i.status === 'active' || selected.includes(i.id))
      .filter((i) => !q || [i.name, i.brand, i.color, i.category].some((f) => f?.toLowerCase().includes(q)))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [items, query, selected]);

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
      wears: existing?.wears ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await onSave(outfit);
    navigate(`/clothes/outfits/${outfit.id}`);
  }

  return (
    <form className="form" onSubmit={submit}>
      <h1>{existing ? 'Edit outfit' : 'New outfit'}</h1>
      <label className="field">
        <span>Name (optional)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday dinner" />
      </label>

      <fieldset className="field">
        <legend>
          Pieces <span className="muted">({selected.length} selected)</span>
        </legend>
        <input type="search" placeholder="Search your closet…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <ul className="picker">
          {choices.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className="picker-item"
                aria-pressed={selected.includes(i.id)}
                onClick={() => toggle(i.id)}
                title={i.name}
              >
                <ItemThumb item={i} />
                <span className="small">{i.name}</span>
                <span className="muted small">{label(i.category)}</span>
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

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
