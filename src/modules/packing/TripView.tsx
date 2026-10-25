import { useMemo, useState, type FormEvent } from 'react';
import { newId } from '../../lib/db';
import { shortDate } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { ItemThumb } from '../clothes/ItemThumb';
import { OutfitCollage } from '../clothes/OutfitCollage';
import { outfitName, outfitPieces } from '../clothes/outfits';
import { label, type ClothingItem, type Outfit } from '../clothes/types';
import { packingList, togglePacked, tripDays, unpackAll, withDayOutfits, withExtra, withoutExtra, withoutManualItem } from './packing';
import { EXTRA_GROUPS, SUGGESTED_EXTRAS, type Trip } from './types';

interface Props {
  trip: Trip;
  items: ClothingItem[];
  outfits: Outfit[];
  onSave: (t: Trip) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function TripView({ trip, items, outfits, onSave, onDelete }: Props) {
  const list = useMemo(() => packingList(trip, items, outfits, outfitName), [trip, items, outfits]);
  const days = tripDays(trip);
  const outfitById = new Map(outfits.map((o) => [o.id, o]));
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

  const byCategory = new Map<string, typeof list.clothes>();
  for (const c of list.clothes) byCategory.set(c.item.category, [...(byCategory.get(c.item.category) ?? []), c]);
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

      <section>
        <h2>Outfits by day</h2>
        <ul className="plan-list">
          {days.map((date) => {
            const planned = (trip.outfitPlan[date] ?? []).map((id) => outfitById.get(id)).filter((o): o is Outfit => !!o);
            const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            });
            return (
              <li key={date} className="plan-day">
                <a className="plan-date" href={href(`/clothes/calendar/${date}`)} title="Open in calendar">
                  {dayLabel}
                </a>
                <div className="plan-outfits">
                  {planned.map((o) => (
                    <span key={o.id} className="plan-outfit">
                      <a href={href(`/clothes/outfits/${o.id}`)} className="plan-outfit-link">
                        <OutfitCollage pieces={outfitPieces(o, items)} />
                        <span className="small">{outfitName(o)}</span>
                      </a>
                      <button
                        className="tile-remove"
                        aria-label={`Remove ${outfitName(o)} from ${dayLabel}`}
                        onClick={() =>
                          onSave(withDayOutfits(trip, date, trip.outfitPlan[date].filter((id) => id !== o.id)))
                        }
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <a className="btn btn-small" href={href(`/packing/${trip.id}/day/${date}`)}>
                    {planned.length ? '+ Add' : '+ Add outfit'}
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2>Clothes</h2>
        {list.clothes.length === 0 && (
          <p className="muted">Plan outfits above, or pick pieces directly. They’ll show up here to check off.</p>
        )}
        {[...byCategory].map(([category, entries]) => {
          const shown = visible(entries);
          if (!shown.length) return null;
          return (
            <div key={category} className="pack-group">
              <h3>{label(category)}</h3>
              <ul className="pack-list">
                {shown.map((c) => (
                  <li key={c.item.id} className={`pack-row${c.packed ? ' packed' : ''}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={c.packed}
                        onChange={() => onSave(togglePacked(trip, c.item.id))}
                      />
                      <ItemThumb item={c.item} />
                      <span className="pack-text">
                        <strong>{c.item.name}</strong>
                        {c.viaOutfits.length > 0 && (
                          <span className="muted small">For {c.viaOutfits.join(', ')}</span>
                        )}
                      </span>
                    </label>
                    {c.manual && c.viaOutfits.length === 0 && (
                      <button
                        className="btn btn-ghost btn-small"
                        aria-label={`Remove ${c.item.name} from this trip`}
                        onClick={() => onSave(withoutManualItem(trip, c.item.id))}
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <a className="btn" href={href(`/packing/${trip.id}/items`)}>
          + Pick pieces
        </a>
      </section>

      <section>
        <h2>Other things</h2>
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
