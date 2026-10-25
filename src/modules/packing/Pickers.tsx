import { useMemo, useState } from 'react';
import { navigate } from '../../lib/router';
import { ItemThumb } from '../clothes/ItemThumb';
import { OutfitCollage } from '../clothes/OutfitCollage';
import { outfitName, outfitPieces } from '../clothes/outfits';
import type { ClothingItem, Outfit } from '../clothes/types';
import { withDayOutfits } from './packing';
import type { Trip } from './types';

interface Props {
  trip: Trip;
  items: ClothingItem[];
  outfits: Outfit[];
  onSave: (t: Trip) => Promise<void>;
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/** Choose which outfits you'll wear on one day of the trip. */
export function DayOutfitPicker({ trip, date, items, outfits, onSave }: Props & { date: string }) {
  const [selected, setSelected] = useState<string[]>(trip.outfitPlan[date] ?? []);
  const [query, setQuery] = useState('');
  const back = `/packing/${trip.id}`;
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return outfits.filter((o) => !q || [outfitName(o), ...(o.tags ?? [])].some((f) => f.toLowerCase().includes(q)));
  }, [outfits, query]);

  async function save() {
    await onSave(withDayOutfits(trip, date, selected));
    navigate(back);
  }

  return (
    <div className="form">
      <h1>
        Outfits ·{' '}
        {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
      </h1>
      <input type="search" placeholder="Search outfits or tags…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {outfits.length === 0 ? (
        <p className="muted">
          No outfits yet. Build some in Clothes → Outfits, or pick pieces directly instead.
        </p>
      ) : (
        <ul className="item-grid">
          {list.map((o) => (
            <li key={o.id}>
              <button
                className="card item-card picker-row"
                aria-pressed={selected.includes(o.id)}
                onClick={() => setSelected((s) => toggle(s, o.id))}
              >
                <OutfitCollage pieces={outfitPieces(o, items)} />
                <span className="item-text">
                  <strong>{outfitName(o)}</strong>
                  <span className="muted small">{o.itemIds.length} pieces</span>
                </span>
                <span className="pick-mark" aria-hidden>
                  {selected.includes(o.id) ? '✓' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="form-actions sticky-actions">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(back)}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save}>
          Save{selected.length ? ` (${selected.length})` : ''}
        </button>
      </div>
    </div>
  );
}

/** Add closet pieces to the trip directly, outside any outfit. */
export function TripItemsPicker({ trip, items, onSave }: Props) {
  const [selected, setSelected] = useState<string[]>(trip.itemIds);
  const [query, setQuery] = useState('');
  const back = `/packing/${trip.id}`;
  const choices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => i.status === 'active' || selected.includes(i.id))
      .filter((i) => !q || [i.name, i.brand, i.color, i.category].some((f) => f?.toLowerCase().includes(q)))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [items, query, selected]);

  async function save() {
    await onSave({ ...trip, itemIds: selected, updatedAt: new Date().toISOString() });
    navigate(back);
  }

  return (
    <div className="form">
      <h1>
        Pick pieces <span className="muted">({selected.length})</span>
      </h1>
      <input type="search" placeholder="Search your closet…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="picker">
        {choices.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              className="picker-item"
              aria-pressed={selected.includes(i.id)}
              onClick={() => setSelected((s) => toggle(s, i.id))}
            >
              <ItemThumb item={i} />
              <span className="small">{i.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="form-actions sticky-actions">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(back)}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
