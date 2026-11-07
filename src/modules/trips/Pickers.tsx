import { useMemo, useState } from 'react';
import { navigate } from '../../lib/router';
import { ItemThumb } from '../clothes/ItemThumb';
import { OutfitCard } from '../clothes/OutfitCard';
import { outfitName } from '../clothes/outfits';
import type { ClothingItem, Outfit, Plan } from '../clothes/types';
import { dayChanges, tripOutfitsByDay } from './tripPlans';
import type { Trip } from './types';

interface Props {
  trip: Trip;
  items: ClothingItem[];
  outfits: Outfit[];
  onSave: (t: Trip) => Promise<void>;
}

interface PlanProps {
  plans: Plan[];
  onSavePlan: (p: Plan) => Promise<void>;
  onRemovePlan: (id: string) => Promise<void>;
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/**
 * Choose which outfits you'll wear on one day of the trip. These are the calendar's own plans for that day:
 * what is chosen here shows on the calendar, and what is planned there shows here.
 */
export function DayOutfitPicker({ trip, date, items, outfits, plans, onSave, onSavePlan, onRemovePlan }: Props & PlanProps & { date: string }) {
  const [selected, setSelected] = useState<string[]>(() => (tripOutfitsByDay(trip, plans, outfits).get(date) ?? []).map((o) => o.id));
  const [query, setQuery] = useState('');
  const back = `/trips/${trip.id}/outfits`;
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return outfits.filter((o) => !q || [outfitName(o), ...(o.tags ?? [])].some((f) => f.toLowerCase().includes(q)));
  }, [outfits, query]);

  async function save() {
    const change = dayChanges(trip, plans, outfits, date, selected);
    for (const p of change.add) await onSavePlan(p);
    for (const id of change.remove) await onRemovePlan(id);
    if (change.trip !== trip) await onSave(change.trip);
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
        <ul className="outfit-cards">
          {list.map((o) => (
            <li key={o.id}>
              <OutfitCard
                outfit={o}
                items={items}
                selected={selected.includes(o.id)}
                onClick={() => setSelected((s) => toggle(s, o.id))}
              />
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
  const back = `/trips/${trip.id}/clothes`;
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
