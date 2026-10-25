import { shortDate, today } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { CalendarCheckIcon, SparkleIcon, WardrobeIcon } from './icons';
import { HeroActions } from './HeroActions';
import { Insights } from './Insights';
import { ItemThumb } from './ItemThumb';
import { OutfitBoard } from './OutfitBoard';
import { outfitName, outfitPieces, wearOutfit } from './outfits';
import { lastWorn, wearCount } from './stats';
import type { ClothingItem, Outfit } from './types';
import { WearLog } from './WearLog';
import { withoutWear } from './wear';

interface Props {
  outfit: Outfit;
  items: ClothingItem[];
  onSaveOutfit: (o: Outfit) => Promise<void>;
  onSaveItem: (i: ClothingItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function OutfitDetail({ outfit, items, onSaveOutfit, onSaveItem, onDelete }: Props) {
  const pieces = outfitPieces(outfit, items);
  const last = lastWorn(outfit);

  async function logWear(date: string) {
    const { outfit: o, pieces: ps } = wearOutfit(outfit, pieces, date);
    if (o) await onSaveOutfit(o);
    for (const p of ps) await onSaveItem(p);
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
          <button className="btn btn-primary" disabled={outfit.wears.includes(today())} onClick={() => logWear(today())}>
            Wore it today
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

      <WearLog
        wears={outfit.wears}
        priorWears={outfit.priorWears}
        hint="Logging a wear here also logs it for each piece."
        canAdd={(d) => !outfit.wears.includes(d)}
        onAdd={logWear}
        onRemove={(i) => onSaveOutfit(withoutWear(outfit, i))}
      />
    </article>
  );
}
