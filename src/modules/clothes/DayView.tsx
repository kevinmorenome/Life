import { today } from '../../lib/format';
import { href } from '../../lib/router';
import { tripsOnDate } from '../packing/packing';
import type { Trip } from '../packing/types';
import { addDays, wearsByDay } from './calendar';
import { ItemThumb } from './ItemThumb';
import { CheckIcon } from '../../icons';
import { OutfitCollage } from './OutfitCollage';
import { outfitName, outfitPieces, wearOutfit } from './outfits';
import { pendingPlans } from './plans';
import type { ClothingItem, Outfit, Plan } from './types';
import { withoutWearOn } from './wear';

interface Props {
  date: string;
  items: ClothingItem[];
  outfits: Outfit[];
  trips?: Trip[];
  plans?: Plan[];
  onRemovePlan?: (id: string) => Promise<void>;
  onSaveItem: (i: ClothingItem) => Promise<void>;
  onSaveOutfit: (o: Outfit) => Promise<void>;
}

export function DayView({ date, items, outfits, trips = [], plans = [], onRemovePlan, onSaveItem, onSaveOutfit }: Props) {
  const wear = wearsByDay(items, outfits).get(date) ?? { outfits: [], items: [] };
  const isFuture = date > today();
  const title = new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Outfits packed for a trip on this day that haven't been logged yet.
  const dayTrips = tripsOnDate(trips, date);
  const outfitById = new Map(outfits.map((o) => [o.id, o]));
  const planned = dayTrips.flatMap((t) =>
    (t.outfitPlan[date] ?? [])
      .map((id) => outfitById.get(id))
      .filter((o): o is Outfit => !!o && !o.wears.includes(date))
      .map((o) => ({ trip: t, outfit: o })),
  );

  const scheduled = pendingPlans(plans, outfits, date);

  async function wearPlanned(o: Outfit, planId?: string) {
    const { outfit, pieces } = wearOutfit(o, outfitPieces(o, items), date);
    if (outfit) await onSaveOutfit(outfit);
    for (const p of pieces) await onSaveItem(p);
    if (planId) await onRemovePlan?.(planId);
  }

  async function removeOutfit(o: Outfit) {
    if (!confirm(`Remove “${outfitName(o)}” from this day? Its pieces’ wears on this day are removed too.`)) return;
    await onSaveOutfit(withoutWearOn(o, date));
    for (const p of outfitPieces(o, items)) if (p.wears.includes(date)) await onSaveItem(withoutWearOn(p, date));
  }

  return (
    <article className="detail">
      <a className="back" href={href(`/clothes/calendar/${date.slice(0, 7)}`)}>
        ← Calendar
      </a>
      <div className="day-head">
        <a className="btn btn-ghost" href={href(`/clothes/calendar/${addDays(date, -1)}`)} aria-label="Previous day">
          ‹
        </a>
        <h1>{title}</h1>
        <a className="btn btn-ghost" href={href(`/clothes/calendar/${addDays(date, 1)}`)} aria-label="Next day">
          ›
        </a>
      </div>

      {dayTrips.length > 0 && (
        <section>
          <h2>Trip</h2>
          {dayTrips.map((t) => (
            <p key={t.id}>
              🧳 <a href={href(`/packing/${t.id}`)}>{t.name}</a>
            </p>
          ))}
          {planned.map(({ trip, outfit }) => (
            <div key={trip.id + outfit.id} className="card item-card">
              <OutfitCollage pieces={outfitPieces(outfit, items)} />
              <div className="item-text">
                <strong>{outfitName(outfit)}</strong>
                <span className="muted small">Planned for {trip.name}</span>
              </div>
              <button className="btn btn-small" onClick={() => wearPlanned(outfit)}>
                Log as worn
              </button>
            </div>
          ))}
        </section>
      )}

      {scheduled.length > 0 && (
        <section>
          <h2>Planned</h2>
          <ul className="item-grid">
            {scheduled.map(({ plan, outfit }) => (
              <li key={plan.id} className="card item-card">
                <a href={href(`/clothes/outfits/${outfit.id}`)} className="item-link">
                  <OutfitCollage pieces={outfitPieces(outfit, items)} />
                  <div className="item-text">
                    <strong>{outfitName(outfit)}</strong>
                    <span className="muted small">{isFuture ? 'Planned' : 'Planned · not logged yet'}</span>
                  </div>
                </a>
                {!isFuture && (
                  <button className="icon-btn" aria-label={`Log ${outfitName(outfit)} as worn`} onClick={() => wearPlanned(outfit, plan.id)}>
                    <CheckIcon />
                  </button>
                )}
                <button className="btn btn-ghost btn-small" aria-label={`Remove plan ${outfitName(outfit)}`} onClick={() => onRemovePlan?.(plan.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {wear.outfits.length === 0 && wear.items.length === 0 && scheduled.length === 0 && planned.length === 0 && (
        <p className="muted center">{isFuture ? 'Nothing planned for this day.' : 'Nothing logged for this day.'}</p>
      )}

      {wear.outfits.length > 0 && (
        <section>
          <h2>Outfits</h2>
          <ul className="item-grid">
            {wear.outfits.map((o) => (
              <li key={o.id} className="card item-card">
                <a href={href(`/clothes/outfits/${o.id}`)} className="item-link">
                  <OutfitCollage pieces={outfitPieces(o, items)} />
                  <div className="item-text">
                    <strong>{outfitName(o)}</strong>
                    <span className="muted small">{o.itemIds.length} pieces</span>
                  </div>
                </a>
                <button className="btn btn-ghost btn-small" aria-label={`Remove ${outfitName(o)}`} onClick={() => removeOutfit(o)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {wear.items.length > 0 && (
        <section>
          <h2>{wear.outfits.length ? 'Also worn' : 'Items'}</h2>
          <ul className="closet-grid day-items">
            {wear.items.map((i) => (
              <li key={i.id}>
                <a href={href(`/clothes/${i.id}`)} className="closet-tile">
                  <ItemThumb item={i} />
                  <span className="tile-name">{i.name}</span>
                </a>
                <button
                  className="tile-remove"
                  aria-label={`Remove ${i.name} from this day`}
                  onClick={() => onSaveItem(withoutWearOn(i, date))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="form-actions start day-actions">
        <a className="btn btn-primary" href={href(`/clothes/calendar/${date}/outfit`)}>
          {isFuture ? '+ Plan an outfit' : '+ Log an outfit'}
        </a>
        {!isFuture && (
          <a className="btn" href={href(`/clothes/calendar/${date}/items`)}>
            + Log items
          </a>
        )}
      </div>
    </article>
  );
}
