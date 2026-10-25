import { useState } from 'react';
import { shortDate, today } from '../../lib/format';
import { href, navigate } from '../../lib/router';
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

  async function logWear() {
    const { outfit: o, pieces: ps } = wearOutfit(outfit, pieces, wearDate);
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
    <article className="detail">
      <a className="back" href={href('/clothes/outfits')}>
        ← Outfits
      </a>
      <div className="outfit-card outfit-hero">
        <OutfitBoard pieces={pieces} large />
      </div>
      <h1>{outfitName(outfit)}</h1>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-value">{wearCount(outfit)}</span>
          <span className="stat-label">wears</span>
        </div>
        <div className="stat">
          <span className="stat-value">{last ? shortDate(last) : '—'}</span>
          <span className="stat-label">last worn</span>
        </div>
        <div className="stat">
          <span className="stat-value">{pieces.length}</span>
          <span className="stat-label">pieces</span>
        </div>
      </div>

      {outfit.tags && outfit.tags.length > 0 && (
        <ul className="chips tag-list" aria-label="Tags">
          {outfit.tags.map((t) => (
            <li key={t} className="chip chip-static">
              {t}
            </li>
          ))}
        </ul>
      )}

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

      <section className="card">
        <h2>Wear log</h2>
        <p className="muted small">Logging a wear here also logs it for each piece.</p>
        <div className="wear-add">
          <input type="date" value={wearDate} max={today()} onChange={(e) => setWearDate(e.target.value)} />
          <button className="btn btn-primary" disabled={!wearDate || outfit.wears.includes(wearDate)} onClick={logWear}>
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
          Delete
        </button>
        <a className="btn btn-primary" href={href(`/clothes/outfits/${outfit.id}/edit`)}>
          Edit
        </a>
      </div>
    </article>
  );
}
