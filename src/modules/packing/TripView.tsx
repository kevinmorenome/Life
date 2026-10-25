import { useMemo, useState, type FormEvent } from 'react';
import { newId } from '../../lib/db';
import { shortDate } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { ItemThumb } from '../clothes/ItemThumb';
import { outfitName } from '../clothes/outfits';
import { label, type ClothingItem, type Outfit } from '../clothes/types';
import { TripCalendar } from './TripCalendar';
import { packingList, togglePacked, unpackAll, withExtra, withoutExtra, withoutManualItem } from './packing';
import { EXTRA_GROUPS, SUGGESTED_EXTRAS, type Trip } from './types';

export type TripTab = 'outfits' | 'clothes' | 'other';
const TABS: { id: TripTab; label: string }[] = [
  { id: 'clothes', label: 'Clothes' },
  { id: 'outfits', label: 'Outfits' },
  { id: 'other', label: 'Other' },
];

interface Props {
  trip: Trip;
  tab: TripTab;
  items: ClothingItem[];
  outfits: Outfit[];
  onSave: (t: Trip) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function TripView({ trip, tab, items, outfits, onSave, onDelete }: Props) {
  const list = useMemo(() => packingList(trip, items, outfits, outfitName), [trip, items, outfits]);
  const [text, setText] = useState('');
  const [group, setGroup] = useState<string>(EXTRA_GROUPS[0]);
  const [showPacked, setShowPacked] = useState(true);

  const addExtra = (extraLabel: string, extraGroup: string) => {
    const t = extraLabel.trim();
    if (t) onSave(withExtra(trip, { id: newId(), label: t, group: extraGroup }));
  };
  function submitExtra(e: FormEvent) {
    e.preventDefault();
    addExtra(text, group);
    setText('');
  }

  const extraGroups = EXTRA_GROUPS.filter((g) => list.extras.some((x) => x.group === g));
  const done = list.total > 0 && list.packedCount === list.total;
  const visible = <T extends { packed: boolean }>(xs: T[]) => (showPacked ? xs : xs.filter((x) => !x.packed));
  const suggestions = (SUGGESTED_EXTRAS[group] ?? []).filter(
    (s) => !trip.extras.some((x) => x.group === group && x.label.toLowerCase() === s.toLowerCase()),
  );

  async function remove() {
    if (!confirm(`Delete “${trip.name}”? Your closet and outfits aren’t affected.`)) return;
    await onDelete(trip.id);
    navigate('/packing');
  }

  return (
    <article className="detail">
      <a className="back" href={href('/packing')}>
        ← Trips
      </a>
      <h1>{trip.name}</h1>
      <p className="muted">
        {[trip.destination, `${shortDate(trip.startDate)} – ${shortDate(trip.endDate)}`].filter(Boolean).join(' · ')}
      </p>

      <div className="card pack-progress" aria-live="polite">
        <strong>{done ? 'All packed 🎉' : `${list.packedCount} of ${list.total} packed`}</strong>
        <progress max={Math.max(list.total, 1)} value={list.packedCount} />
        <div className="form-actions start">
          <button className="btn btn-small" onClick={() => setShowPacked((s) => !s)}>
            {showPacked ? 'Hide packed' : 'Show packed'}
          </button>
          {list.packedCount > 0 && (
            <button className="btn btn-small btn-ghost" onClick={() => onSave(unpackAll(trip))}>
              Unpack all
            </button>
          )}
        </div>
      </div>

      <nav className="seg" role="tablist" aria-label="Trip sections">
        {TABS.map((t) => {
          const count =
            t.id === 'clothes'
              ? `${list.clothes.filter((c) => c.packed).length}/${list.clothes.length}`
              : t.id === 'other'
                ? `${list.extras.filter((x) => x.packed).length}/${list.extras.length}`
                : `${Object.values(trip.outfitPlan).flat().length}`;
          return (
            <a key={t.id} role="tab" aria-selected={tab === t.id} href={href(`/packing/${trip.id}/${t.id}`)}>
              {t.label} <span className="count">{count}</span>
            </a>
          );
        })}
      </nav>

      {tab === 'outfits' && <TripCalendar trip={trip} items={items} outfits={outfits} />}
      {tab === 'clothes' && (
      <section>
        {list.clothes.length === 0 && (
          <p className="muted">Plan outfits, or pick pieces directly. They’ll show up here to check off.</p>
        )}
        {list.clothes.length > 0 && (
          <p className="muted small">Double-tap a piece (or tap its ✓) to mark it packed.</p>
        )}
        <ul className="closet-grid pack-grid">
          {visible(list.clothes).map((c) => (
            <li key={c.item.id} className={`pack-tile${c.packed ? ' packed' : ''}`}>
              <button
                type="button"
                className="closet-tile"
                aria-pressed={c.packed}
                aria-label={`${c.item.name}, ${c.packed ? 'packed' : 'not packed'}. Double-tap to toggle`}
                onDoubleClick={() => onSave(togglePacked(trip, c.item.id))}
              >
                <ItemThumb item={c.item} />
                <span className="tile-name">{c.item.name}</span>
                <span className="tile-meta">{c.viaOutfits.length ? `For ${c.viaOutfits.join(', ')}` : label(c.item.category)}</span>
              </button>
              <button
                type="button"
                className={`pack-check${c.packed ? ' on' : ''}`}
                aria-label={c.packed ? `Unpack ${c.item.name}` : `Pack ${c.item.name}`}
                onClick={() => onSave(togglePacked(trip, c.item.id))}
              >
                {c.packed ? '✓' : ''}
              </button>
              {c.manual && c.viaOutfits.length === 0 && (
                <button
                  type="button"
                  className="pack-remove"
                  aria-label={`Remove ${c.item.name} from this trip`}
                  onClick={() => onSave(withoutManualItem(trip, c.item.id))}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
        <p>
          <a className="btn" href={href(`/packing/${trip.id}/items`)}>
            + Pick pieces
          </a>
        </p>
      </section>
      )}
      {tab === 'other' && (
      <section>
        {extraGroups.map((g) => {
          const shown = visible(list.extras.filter((x) => x.group === g));
          if (!shown.length) return null;
          return (
            <div key={g} className="pack-group">
              <h3>{g}</h3>
              <ul className="pack-list">
                {shown.map((x) => (
                  <li key={x.id} className={`pack-row${x.packed ? ' packed' : ''}`}>
                    <label>
                      <input type="checkbox" checked={x.packed} onChange={() => onSave(togglePacked(trip, x.id))} />
                      <span className="pack-text">
                        <strong>{x.label}</strong>
                      </span>
                    </label>
                    <button
                      className="btn btn-ghost btn-small"
                      aria-label={`Remove ${x.label}`}
                      onClick={() => onSave(withoutExtra(trip, x.id))}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <form className="extra-form" onSubmit={submitExtra}>
          <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Group">
            {EXTRA_GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add something…" aria-label="Item to pack" />
          <button className="btn btn-primary" disabled={!text.trim()}>
            Add
          </button>
        </form>
        {suggestions.length > 0 && (
          <div className="chips">
            {suggestions.map((s) => (
              <button key={s} className="chip" onClick={() => addExtra(s, group)}>
                + {s}
              </button>
            ))}
          </div>
        )}
      </section>

      )}

      <div className="form-actions start day-actions">
        <a className="btn" href={href(`/packing/${trip.id}/edit`)}>
          Edit trip
        </a>
        <button className="btn btn-ghost" onClick={remove}>
          Delete trip
        </button>
      </div>
    </article>
  );
}
