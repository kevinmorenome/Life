import { useMemo, useState, type FormEvent } from 'react';
import { EditIcon, EyeIcon, EyeOffIcon, PlusIcon, TrashIcon, UndoIcon } from '../../icons';
import { newId } from '../../lib/db';
import { shortDate } from '../../lib/format';
import { Flag } from '../countries/Flag';
import { tripCountry } from '../countries/countries';
import { href, navigate } from '../../lib/router';
import { ItemThumb } from '../clothes/ItemThumb';
import { outfitName } from '../clothes/outfits';
import { label, type ClothingItem, type Outfit, type Plan } from '../clothes/types';
import type { TripitPlan } from '../../../worker/tripitTypes';
import type { Checkin } from '../checkins/types';
import { Itinerary } from './Itinerary';
import { TripCalendar } from './TripCalendar';
import { plansOfTrip } from './tripit';
import { tripOutfitsByDay } from './tripPlans';
import { packingList, togglePacked, unpackAll, withExtra, withoutExtra, withoutManualItem } from './packing';
import { EXTRA_GROUPS, SUGGESTED_EXTRAS, type Trip } from './types';

export type TripTab = 'outfits' | 'clothes' | 'other' | 'itinerary';
const TABS: { id: Exclude<TripTab, 'itinerary'>; label: string }[] = [
  { id: 'clothes', label: 'Clothes' },
  { id: 'outfits', label: 'Outfits' },
  { id: 'other', label: 'Other' },
];

interface Props {
  trip: Trip;
  tab: TripTab;
  items: ClothingItem[];
  outfits: Outfit[];
  plans: Plan[];
  tripitPlans: TripitPlan[];
  checkins?: Checkin[];
  onSave: (t: Trip) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function TripView({ trip, tab, items, outfits, plans, tripitPlans, checkins, onSave, onDelete }: Props) {
  const list = useMemo(() => packingList(trip, items, outfits, outfitName, plans), [trip, items, outfits, plans]);
  const outfitCount = useMemo(() => [...tripOutfitsByDay(trip, plans, outfits).values()].reduce((n, day) => n + day.length, 0), [trip, plans, outfits]);
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
    navigate('/trips');
  }

  return (
    <article className="detail">
      {trip.photo && <img className="trip-photo" src={trip.photo} alt="" />}
      <div className="title-row">
        <h1>
          <Flag code={tripCountry(trip)} /> {trip.name}
        </h1>
        <a className="pack-icon" href={href(`/trips/${trip.id}/edit`)} aria-label="Edit trip" title="Edit trip">
          <EditIcon />
        </a>
        <button className="pack-icon" onClick={remove} aria-label="Delete trip" title="Delete trip">
          <TrashIcon />
        </button>
      </div>
      <p className="muted">
        {[trip.destination, `${shortDate(trip.startDate)} – ${shortDate(trip.endDate)}`].filter(Boolean).join(' · ')}
      </p>

      <div className="seg" role="tablist" aria-label="Trip pages" style={{ ['--tabs' as string]: 2 }}>
        <button type="button" role="tab" aria-selected={tab !== 'itinerary'} onClick={() => tab === 'itinerary' && navigate(`/trips/${trip.id}`)}>
          Packing
        </button>
        <button type="button" role="tab" aria-selected={tab === 'itinerary'} onClick={() => tab !== 'itinerary' && navigate(`/trips/${trip.id}/itinerary`)}>
          Itinerary
        </button>
      </div>

      {tab === 'itinerary' ? (
        <Itinerary
          plans={plansOfTrip(tripitPlans, trip)}
          checkins={checkins}
          startDate={trip.startDate}
          endDate={trip.endDate}
        />
      ) : (
      <>
      <div className="card pack-progress" aria-live="polite">
        <div className="progress-head">
          <strong>{done ? 'All packed 🎉' : `${list.packedCount} of ${list.total} packed`}</strong>
          <span className="pack-icons">
            <button
              className="pack-icon"
              onClick={() => setShowPacked((x) => !x)}
              aria-label={showPacked ? 'Hide packed' : 'Show packed'}
              aria-pressed={!showPacked}
              title={showPacked ? 'Hide packed' : 'Show packed'}
            >
              {showPacked ? <EyeIcon /> : <EyeOffIcon />}
            </button>
            {list.packedCount > 0 && (
              <button
                className="pack-icon"
                onClick={() => onSave(unpackAll(trip))}
                aria-label="Unpack all"
                title="Unpack all"
              >
                <UndoIcon />
              </button>
            )}
          </span>
        </div>
        <progress max={Math.max(list.total, 1)} value={list.packedCount} />
      </div>

      <nav className="trip-tabs" role="tablist" aria-label="Trip sections">
        {TABS.map((t) => {
          const count =
            t.id === 'clothes'
              ? `${list.clothes.filter((c) => c.packed).length}/${list.clothes.length}`
              : t.id === 'other'
                ? `${list.extras.filter((x) => x.packed).length}/${list.extras.length}`
                : `${outfitCount}`;
          return (
            <a key={t.id} role="tab" aria-selected={tab === t.id} href={href(`/trips/${trip.id}/${t.id}`)}>
              {t.label} <span className="count">{count}</span>
            </a>
          );
        })}
      </nav>

      {tab === 'outfits' && <TripCalendar trip={trip} items={items} outfits={outfits} plans={plans} />}
      {tab === 'clothes' && (
      <section>
        {list.clothes.length === 0 && (
          <p className="muted">Plan outfits, or pick pieces directly. They’ll show up here to check off.</p>
        )}
        <div className="clothes-head">
          <p className="muted small">
            {list.clothes.length > 0 ? 'Double-tap a piece (or tap its ✓) to mark it packed.' : ''}
          </p>
          <a className="pack-icon" href={href(`/trips/${trip.id}/items`)} aria-label="Pick pieces" title="Pick pieces">
            <PlusIcon />
          </a>
        </div>
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
                <span className="tile-meta">{c.viaOutfits.length ? `For ${c.viaOutfits.join(', ')}` : c.worn ? 'Worn on this trip' : label(c.item.category)}</span>
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
          <button className="pack-icon filled" disabled={!text.trim()} aria-label="Add" title="Add">
            <PlusIcon />
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
      </>
      )}
    </article>
  );
}
