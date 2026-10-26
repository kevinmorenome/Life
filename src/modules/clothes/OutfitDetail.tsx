import { shortDate, today } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { CalendarCheckIcon, CheckIcon, SparkleIcon, WardrobeIcon } from './icons';
import { HeroActions } from './HeroActions';
import { Insights } from './Insights';
import { ItemThumb } from './ItemThumb';
import { OutfitBoard } from './OutfitBoard';
import { outfitName, outfitPieces, unwearOutfit, wearOutfit } from './outfits';
import { newPlan, upcomingPlans } from './plans';
import { lastWorn, wearCount } from './stats';
import type { ClothingItem, Outfit, Plan } from './types';
import { WearLog } from './WearLog';
import { withoutWear } from './wear';

interface Props {
  outfit: Outfit;
  items: ClothingItem[];
  plans: Plan[];
  onSavePlan: (p: Plan) => Promise<void>;
  onRemovePlan: (id: string) => Promise<void>;
  onSaveOutfit: (o: Outfit) => Promise<void>;
  onSaveItem: (i: ClothingItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function OutfitDetail({ outfit, items, plans, onSavePlan, onRemovePlan, onSaveOutfit, onSaveItem, onDelete }: Props) {
  const pieces = outfitPieces(outfit, items);
  const last = lastWorn(outfit);
  const wornToday = outfit.wears.includes(today());

  async function logWear(date: string) {
    const { outfit: o, pieces: ps } = wearOutfit(outfit, pieces, date);
    if (o) await onSaveOutfit(o);
    for (const p of ps) await onSaveItem(p);
  }

  async function undoWear(date: string) {
    const { outfit: o, pieces: ps } = unwearOutfit(outfit, pieces, date);
    if (o) await onSaveOutfit(o);
    for (const p of ps) await onSaveItem(p);
  }

  const upcoming = upcomingPlans(plans, outfit, today());
  const dayLabel = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  // Future dates become plans; today and past dates are real wears.
  async function addDate(date: string) {
    if (date > today()) await onSavePlan(newPlan(outfit.id, date));
    else await logWear(date);
  }

  async function del() {
    if (confirm(`Delete “${outfitName(outfit)}”? The clothes themselves stay.`)) {
      await onDelete(outfit.id);
      navigate('/clothes/outfits');
    }
  }

  return (
    <article className="detail item-detail">
      <header className="hero">
        <div className="hero-top">
          <a className="back" href={href('/clothes/outfits')} aria-label="Back to outfits">
            ←
          </a>
          <p className="hero-pill">
            {wearCount(outfit)} <span className="muted">{wearCount(outfit) === 1 ? 'wear' : 'wears'}</span>
          </p>
        </div>
        <div className="outfit-card outfit-hero">
          <OutfitBoard pieces={pieces} large />
        </div>
        <h1>{outfitName(outfit)}</h1>
        <p className="muted small">{pieces.length} {pieces.length === 1 ? 'piece' : 'pieces'}</p>
        <HeroActions
          editPath={`/clothes/outfits/${outfit.id}/edit`}
          favorite={!!outfit.favorite}
          onToggleFavorite={() => onSaveOutfit({ ...outfit, favorite: !outfit.favorite, updatedAt: new Date().toISOString() })}
          onDelete={del}
          deleteLabel="Delete outfit"
        >
          <button
            className={wornToday ? 'btn btn-primary btn-done' : 'btn btn-primary'}
            aria-pressed={wornToday}
            aria-label={wornToday ? 'Worn today. Tap to undo' : undefined}
            onClick={() => (wornToday ? undoWear(today()) : logWear(today()))}
          >
            {wornToday ? (
              <>
                <CheckIcon /> Worn today
              </>
            ) : (
              'Wore it today'
            )}
          </button>
        </HeroActions>
      </header>

      {outfit.tags && outfit.tags.length > 0 && (
        <ul className="chips tag-list" aria-label="Tags">
          {outfit.tags.map((t) => (
            <li key={t} className="chip chip-static">
              {t}
            </li>
          ))}
        </ul>
      )}

      <section>
        <h2>Pieces</h2>
        <ul className="piece-grid">
          {pieces.map((p) => (
            <li key={p.id}>
              <a href={href(`/clothes/${p.id}`)} className="piece">
                <ItemThumb item={p} large />
                <span className="small">{p.name}</span>
                {p.status !== 'active' && <span className="muted small">{p.status}</span>}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <Insights
        insights={[
          { value: last ? shortDate(last) : 'Never', label: 'Last worn', tone: 'lime', icon: <CalendarCheckIcon /> },
          { value: String(wearCount(outfit)), label: 'Total wears', tone: 'purple', icon: <SparkleIcon /> },
          { value: String(pieces.length), label: 'Pieces', tone: 'blue', icon: <WardrobeIcon /> },
        ]}
      />

      {upcoming.length > 0 && (
        <section className="plain">
          <h2>
            Planned <span className="count-badge">{upcoming.length}</span>
          </h2>
          <ul className="wear-entries">
            {upcoming.map((p) => (
              <li key={p.id}>
                <span className="wear-dot" aria-hidden />
                <a className="wear-main" href={href(`/clothes/calendar/${p.date}`)}>
                  {dayLabel(p.date)}
                </a>
                <button className="wear-remove" aria-label={`Remove plan on ${dayLabel(p.date)}`} onClick={() => onRemovePlan(p.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <WearLog
        allowFuture
        wears={outfit.wears}
        priorWears={outfit.priorWears}
        hint="Logging a wear here also logs it for each piece. Pick a future date to plan it."
        canAdd={(d) => !outfit.wears.includes(d)}
        onAdd={addDate}
        onRemove={(i) => onSaveOutfit(withoutWear(outfit, i))}
      />
    </article>
  );
}
