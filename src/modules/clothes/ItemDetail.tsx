import { useState } from 'react';
import { money, shortDate, today } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { ItemThumb } from './ItemThumb';
import { costPerWear, lastWorn, wearCount } from './stats';
import { outfitName } from './outfits';
import { label, type ClothingItem, type Outfit } from './types';
import { withWear, withoutWear } from './wear';

interface Props {
  item: ClothingItem;
  outfits: Outfit[];
  onSave: (item: ClothingItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ItemDetail({ item, outfits, onSave, onDelete }: Props) {
  const [wearDate, setWearDate] = useState(today());
  const cpw = costPerWear(item);
  const inOutfits = outfits.filter((o) => o.itemIds.includes(item.id));
  const last = lastWorn(item);

  const facts: [string, string | undefined][] = [
    ['Category', label(item.category)],
    ['Status', label(item.status)],
    ['Brand', item.brand],
    ['Color', item.color],
    ['Size', item.size],
    ['Material', item.material],
    ['Condition', item.condition && label(item.condition)],
    ['Seasons', item.seasons.map(label).join(', ') || undefined],
    ['Price', item.price != null ? money(item.price) : undefined],
    ['Purchased', item.purchaseDate && shortDate(item.purchaseDate)],
  ];

  async function del() {
    if (confirm(`Delete “${item.name}”? This can’t be undone.`)) {
      await onDelete(item.id);
      navigate('/clothes');
    }
  }

  return (
    <article className="detail">
      <a className="back" href={href('/clothes')}>
        ← Closet
      </a>
      <div className="detail-head">
        <ItemThumb item={item} large />
        <div>
          <h1>{item.name}</h1>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-value">{wearCount(item)}</span>
              <span className="stat-label">wears</span>
            </div>
            <div className="stat">
              <span className="stat-value">{cpw != null ? money(cpw) : '—'}</span>
              <span className="stat-label">per wear</span>
            </div>
            <div className="stat">
              <span className="stat-value">{last ? shortDate(last) : 'Never'}</span>
              <span className="stat-label">last worn</span>
            </div>
          </div>
        </div>
      </div>

      <dl className="facts card">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>

      {item.tags && item.tags.length > 0 && (
        <ul className="chips tag-list" aria-label="Tags">
          {item.tags.map((t) => (
            <li key={t} className="chip chip-static">
              {t}
            </li>
          ))}
        </ul>
      )}

      {item.occasions && item.occasions.length > 0 && (
        <section className="tag-section">
          <h2 className="small muted">Occasions</h2>
          <ul className="chips tag-list">
            {item.occasions.map((t) => (
              <li key={t} className="chip chip-static">
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      {item.notes && <p className="card notes">{item.notes}</p>}

      <section className="card">
        <h2>Wear log</h2>
        <div className="wear-add">
          <input type="date" value={wearDate} max={today()} onChange={(e) => setWearDate(e.target.value)} />
          <button className="btn btn-primary" disabled={!wearDate} onClick={() => onSave(withWear(item, wearDate))}>
            Log wear
          </button>
        </div>
        {item.priorWears ? (
          <p className="muted small">
            Plus {item.priorWears} earlier {item.priorWears === 1 ? 'wear' : 'wears'} without dates (imported).
          </p>
        ) : null}
        {item.wears.length === 0 ? (
          !item.priorWears && <p className="muted small">Not worn yet.</p>
        ) : (
          <ul className="wear-list">
            {item.wears
              .map((d, i) => ({ d, i }))
              .reverse()
              .map(({ d, i }) => (
                <li key={`${d}-${i}`}>
                  <span>{shortDate(d)}</span>
                  <button
                    className="btn btn-ghost btn-small"
                    aria-label={`Remove wear on ${shortDate(d)}`}
                    onClick={() => onSave(withoutWear(item, i))}
                  >
                    ✕
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>

      {inOutfits.length > 0 && (
        <section className="card">
          <h2>In {inOutfits.length} {inOutfits.length === 1 ? 'outfit' : 'outfits'}</h2>
          <ul className="rank-list">
            {inOutfits.map((o) => (
              <li key={o.id}>
                <a href={href(`/clothes/outfits/${o.id}`)}>{outfitName(o)}</a>
                <span className="muted small">{o.itemIds.length} pieces</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="form-actions">
        <button className="btn btn-danger" onClick={del}>
          Delete
        </button>
        <a className="btn btn-primary" href={href(`/clothes/${item.id}/edit`)}>
          Edit
        </a>
      </div>
    </article>
  );
}
