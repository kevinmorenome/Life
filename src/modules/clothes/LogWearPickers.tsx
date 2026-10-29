import { useMemo, useState } from 'react';
import { shortDate, today } from '../../lib/format';
import { PlusIcon } from '../../icons';
import { href, navigate } from '../../lib/router';
import { ItemThumb } from './ItemThumb';
import { OutfitCard } from './OutfitCard';
import { OutfitForm } from './OutfitForm';
import { outfitName, outfitPieces, wearOutfit } from './outfits';
import { newPlan } from './plans';
import { lastWorn } from './stats';
import { label, type ClothingItem, type Outfit, type Plan } from './types';
import { withWear } from './wear';

interface Props {
  date: string;
  items: ClothingItem[];
  outfits: Outfit[];
  onSaveItem: (i: ClothingItem) => Promise<void>;
  onSaveOutfit: (o: Outfit) => Promise<void>;
  onSavePlan?: (p: Plan) => Promise<void>;
}

const back = (date: string) => navigate(`/calendar/${date}`);

/** Pick one outfit to log on `date` (also logs its pieces). */
export function LogOutfitPicker({ date, items, outfits, onSaveItem, onSaveOutfit, onSavePlan }: Props) {
  const future = date > today();
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return outfits
      .filter((o) => !o.wears.includes(date))
      .filter((o) => !q || [outfitName(o), ...(o.tags ?? [])].some((f) => f.toLowerCase().includes(q)))
      .sort((a, b) => (lastWorn(b) ?? '').localeCompare(lastWorn(a) ?? ''));
  }, [outfits, query, date]);

  async function pick(o: Outfit) {
    if (future) {
      await onSavePlan?.(newPlan(o.id, date));
      return back(date);
    }
    const { outfit, pieces } = wearOutfit(o, outfitPieces(o, items), date);
    if (outfit) await onSaveOutfit(outfit);
    for (const p of pieces) await onSaveItem(p);
    back(date);
  }

  return (
    <div className="form">
      <div className="today-head">
        <h1>{future ? 'Plan an outfit' : 'Log an outfit'} · {shortDate(date)}</h1>
        <a className="icon-action" href={href(`/clothes/calendar/${date}/new-outfit`)} aria-label="Create a new outfit">
          <PlusIcon />
        </a>
      </div>
      <input type="search" placeholder="Search outfits or tags…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {list.length === 0 ? (
        <p className="muted">No outfits to pick. Create one with the + button{future ? '.' : ', or log items instead.'}</p>
      ) : (
        <ul className="outfit-cards">
          {list.map((o) => (
            <li key={o.id}>
              <OutfitCard outfit={o} items={items} onClick={() => pick(o)} label={`${future ? 'Plan' : 'Log'} ${outfitName(o)}`} />
            </li>
          ))}
        </ul>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => back(date)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Build a new outfit, then plan it (future day) or log it (today/past) and return to the day. */
export function NewOutfitForDay({ date, items, onSaveItem, onSaveOutfit, onSavePlan }: Props) {
  async function apply(o: Outfit) {
    if (date > today()) await onSavePlan?.(newPlan(o.id, date));
    else {
      const { outfit, pieces } = wearOutfit(o, outfitPieces(o, items), date);
      if (outfit) await onSaveOutfit(outfit);
      for (const p of pieces) await onSaveItem(p);
    }
    back(date);
  }
  return <OutfitForm items={items} onSave={onSaveOutfit} afterSave={apply} />;
}

/** Pick any number of items to log on `date`. */
export function LogItemsPicker({ date, items, onSaveItem }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const choices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => i.status === 'active' && !i.wears.includes(date))
      .filter((i) => !q || [i.name, i.brand, i.color, i.category].some((f) => f?.toLowerCase().includes(q)))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [items, query, date]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function save() {
    for (const i of items) if (selected.includes(i.id)) await onSaveItem(withWear(i, date));
    back(date);
  }

  return (
    <div className="form">
      <h1>Log items · {shortDate(date)}</h1>
      <input type="search" placeholder="Search your closet…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="picker">
        {choices.map((i) => (
          <li key={i.id}>
            <button type="button" className="picker-item" aria-pressed={selected.includes(i.id)} onClick={() => toggle(i.id)}>
              <ItemThumb item={i} />
              <span className="small">{i.name}</span>
              <span className="muted small">{label(i.category)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="form-actions sticky-actions">
        <button type="button" className="btn btn-ghost" onClick={() => back(date)}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={selected.length === 0} onClick={save}>
          Log {selected.length || ''} {selected.length === 1 ? 'item' : 'items'}
        </button>
      </div>
    </div>
  );
}
