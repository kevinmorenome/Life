import type { ReactNode } from 'react';
import { DayWidget } from '../../DayWidget';
import { today } from '../../lib/format';
import { href } from '../../lib/router';
import { tripsOnDate } from '../trips/packing';
import type { Trip } from '../trips/types';
import { addDays, wearsByDay } from './calendar';
import { ItemThumb } from './ItemThumb';
import { CheckIcon, HangerIcon, ShirtIcon, SuitcaseIcon, TrashIcon } from '../../icons';
import { OutfitCard } from './OutfitCard';
import { outfitFromItems, outfitName, outfitPieces, unwearOutfit, wearOutfit } from './outfits';
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
  /** Sections from other modules, shown under the date. */
  children?: ReactNode;
}

export function DayView({ date, items, outfits, trips = [], plans = [], onRemovePlan, onSaveItem, onSaveOutfit, children }: Props) {
  const wear = wearsByDay(items, outfits).get(date) ?? { outfits: [], items: [] };
  const isFuture = date > today();
  const title = new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    ...(date.slice(0, 4) !== today().slice(0, 4) ? { year: 'numeric' as const } : {}),
  });

  // The outfits for a trip day are the calendar's own plans (the Planned widget below), not a copy.
  const dayTrips = tripsOnDate(trips, date);

  const scheduled = pendingPlans(plans, outfits, date);

  async function wearPlanned(o: Outfit, planId?: string) {
    const { outfit, pieces } = wearOutfit(o, outfitPieces(o, items), date);
    if (outfit) await onSaveOutfit(outfit);
    for (const p of pieces) await onSaveItem(p);
    if (planId) await onRemovePlan?.(planId);
  }

  async function removeOutfit(o: Outfit) {
    if (!confirm(`Remove “${outfitName(o)}” from this day? Its pieces’ wears on this day are removed too.`)) return;
    const { outfit, pieces } = unwearOutfit(o, outfitPieces(o, items), date);
    if (outfit) await onSaveOutfit(outfit);
    for (const p of pieces) await onSaveItem(p);
  }

  async function saveAsOutfit() {
    await onSaveOutfit(outfitFromItems(wear.items, date));
  }

  return (
    <article className="detail">
      <div className="day-head">
        <a className="btn btn-ghost" href={href(`/calendar/${addDays(date, -1)}`)} aria-label="Previous day">
          ‹
        </a>
        <h1>{title}</h1>
        <a className="btn btn-ghost" href={href(`/calendar/${addDays(date, 1)}`)} aria-label="Next day">
          ›
        </a>
      </div>

      <div className="day-grid">
        {children}

        {dayTrips.length > 0 && (
          <DayWidget
            id="trip"
            title="Trip"
            icon={<SuitcaseIcon />}
            tone="trip"
            size="half"
            badge={dayTrips.length > 1 ? dayTrips.length : undefined}
            summary={dayTrips.map((t) => t.name).join(', ')}
          >
            {dayTrips.map((t) => (
              <p key={t.id} className="widget-line">
                <a href={href(`/trips/${t.id}`)}>{t.name}</a>
              </p>
            ))}
          </DayWidget>
        )}

        {scheduled.length > 0 && (
          <DayWidget id="planned" title="Planned" icon={<HangerIcon />} tone="clothes" size="full" badge={scheduled.length} summary={scheduled.map(({ outfit }) => outfitName(outfit)).join(', ')}>
            <ul className="outfit-cards">
              {scheduled.map(({ plan, outfit }) => (
                <li key={plan.id}>
                  <OutfitCard outfit={outfit} items={items} to={`/clothes/outfits/${outfit.id}`}>
                    {isFuture ? (
                      <button className="card-fab" aria-label={`Remove plan ${outfitName(outfit)}`} onClick={() => onRemovePlan?.(plan.id)}>
                        <TrashIcon />
                      </button>
                    ) : (
                      <>
                        <button className="card-fab" aria-label={`Log ${outfitName(outfit)} as worn`} onClick={() => wearPlanned(outfit, plan.id)}>
                          <CheckIcon />
                        </button>
                        <button className="card-fab card-fab-left" aria-label={`Remove plan ${outfitName(outfit)}`} onClick={() => onRemovePlan?.(plan.id)}>
                          <TrashIcon />
                        </button>
                      </>
                    )}
                  </OutfitCard>
                </li>
              ))}
            </ul>
          </DayWidget>
        )}

        {wear.outfits.length > 0 && (
          <DayWidget id="outfits" title="Outfits" icon={<HangerIcon />} tone="clothes" size="full" badge={wear.outfits.length} summary={wear.outfits.map(outfitName).join(', ')}>
            <ul className="outfit-cards">
              {wear.outfits.map((o) => (
                <li key={o.id}>
                  <OutfitCard outfit={o} items={items} to={`/clothes/outfits/${o.id}`}>
                    <button className="card-fab" aria-label={`Remove ${outfitName(o)} from this day`} onClick={() => removeOutfit(o)}>
                      <TrashIcon />
                    </button>
                  </OutfitCard>
                </li>
              ))}
            </ul>
          </DayWidget>
        )}

        {wear.items.length > 0 && (
          <DayWidget
            id="worn"
            title={wear.outfits.length ? 'Also worn' : 'Worn'}
            icon={<ShirtIcon />}
            tone="clothes"
            size="full"
            badge={wear.items.length}
            summary={wear.items.map((i) => i.name).join(', ')}
            action={
              wear.items.length > 1 ? (
                <button className="icon-btn" aria-label="Save these items as an outfit" onClick={saveAsOutfit}>
                  <ShirtIcon />
                </button>
              ) : undefined
            }
          >
            <ul className="closet-grid day-items">
              {wear.items.map((i) => (
                <li key={i.id}>
                  <a href={href(`/clothes/${i.id}`)} className="closet-tile">
                    <ItemThumb item={i} />
                    <span className="tile-name">{i.name}</span>
                  </a>
                  <button className="tile-remove" aria-label={`Remove ${i.name} from this day`} onClick={() => onSaveItem(withoutWearOn(i, date))}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </DayWidget>
        )}
      </div>

      {wear.outfits.length === 0 && wear.items.length === 0 && scheduled.length === 0 && (
        <p className="muted center day-empty">{isFuture ? 'No outfit planned for this day.' : 'No outfit logged for this day.'}</p>
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
