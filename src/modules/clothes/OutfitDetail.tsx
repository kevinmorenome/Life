import { useState } from 'react';
import { shortDate, today } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { CalendarCheckIcon, SparkleIcon, WardrobeIcon } from './icons';
import { Insights } from './Insights';
import { ItemThumb } from './ItemThumb';
import { OutfitBoard } from './OutfitBoard';
import { outfitName, outfitPieces, wearOutfit } from './outfits';
import { lastWorn, wearCount } from './stats';
import type { ClothingItem, Outfit } from './types';
import { withoutWear } from './wear';

interface Props {
  outfit: Outfit;
  items: ClothingItem[];
  onSaveOutfit: (o: Outfit) => Promise<void>;
  onSaveItem: (i: ClothingItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function OutfitDetail({ outfit, items, onSaveOutfit, onSaveItem, onDelete }: Props) {
  const [wearDate, setWearDate] = useState(today());
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
        <div className="hero-actions">
          <a className="btn" href={href(`/clothes/outfits/${outfit.id}/edit`)}>
            Edit
          </a>
          <button className="btn btn-primary" disabled={outfit.wears.includes(today())} onClick={() => logWear(today())}>
            Wore it today
          </button>
        </div>
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

      <section className="plain">
        <h2>Wear log</h2>
        <p className="muted small">Logging a wear here also logs it for each piece.</p>
        <div className="wear-add">
          <input type="date" value={wearDate} max={today()} onChange={(e) => setWearDate(e.target.value)} />
          <button className="btn btn-primary" disabled={!wearDate || outfit.wears.includes(wearDate)} onClick={() => logWear(wearDate)}>
            Log wear
          </button>
        </div>
        {outfit.priorWears ? (
          <p className="muted small">
            Plus {outfit.priorWears} earlier {outfit.priorWears === 1 ? 'wear' : 'wears'} without dates (imported).
          </p>
        ) : null}
        {outfit.wears.length > 0 && (
          <ul className="wear-list">
            {outfit.wears
              .map((d, i) => ({ d, i }))
              .reverse()
              .map(({ d, i }) => (
                <li key={`${d}-${i}`}>
                  <span>{shortDate(d)}</span>
                  <button
                    className="btn btn-ghost btn-small"
                    aria-label={`Remove wear on ${shortDate(d)}`}
                    onClick={() => onSaveOutfit(withoutWear(outfit, i))}
                  >
                    ✕
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>

      <div className="form-actions">
        <button className="btn btn-danger" onClick={del}>
          Delete outfit
        </button>
      </div>
    </article>
  );
}
