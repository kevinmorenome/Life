import { useMemo, useState } from 'react';
import { shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { ClothesTabs } from './ClothesTabs';
import { OutfitCollage } from './OutfitCollage';
import { outfitName, outfitPieces, wearOutfit } from './outfits';
import { lastWorn, wearCount } from './stats';
import type { ClothingItem, Outfit } from './types';

type Sort = 'recent-worn' | 'most-worn' | 'newest';

interface Props {
  outfits: Outfit[];
  items: ClothingItem[];
  onSaveOutfit: (o: Outfit) => Promise<void>;
  onSaveItem: (i: ClothingItem) => Promise<void>;
}

export function OutfitList({ outfits, items, onSaveOutfit, onSaveItem }: Props) {
  const [sort, setSort] = useState<Sort>('recent-worn');
  const [query, setQuery] = useState('');
  const date = today();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return outfits
      .filter((o) => !q || [outfitName(o), ...(o.tags ?? [])].some((f) => f.toLowerCase().includes(q)))
      .sort((a, b) => {
        if (sort === 'most-worn') return wearCount(b) - wearCount(a);
        if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt);
        return (lastWorn(b) ?? '').localeCompare(lastWorn(a) ?? '');
      });
  }, [outfits, query, sort]);

  async function wear(o: Outfit) {
    const { outfit, pieces } = wearOutfit(o, outfitPieces(o, items), date);
    if (outfit) await onSaveOutfit(outfit);
    for (const p of pieces) await onSaveItem(p);
  }

  return (
    <>
      <div className="page-head">
        <h1>Clothes</h1>
        <a className="btn btn-primary" href={href('/clothes/outfits/new')}>
          + Outfit
        </a>
      </div>
      <ClothesTabs active="outfits" />

      {outfits.length === 0 ? (
        <div className="empty">
          <p>No outfits yet.</p>
          <a className="btn btn-primary" href={href('/clothes/outfits/new')}>
            Put one together
          </a>
        </div>
      ) : (
        <>
          <div className="filters filter-row-2">
            <input type="search" placeholder="Search outfits or tags…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="recent-worn">Recently worn</option>
              <option value="most-worn">Most worn</option>
              <option value="newest">Newest</option>
            </select>
          </div>
          <p className="muted small">
            {visible.length} of {outfits.length} outfits
          </p>
          <ul className="item-grid">
            {visible.map((o) => {
              const pieces = outfitPieces(o, items);
              const last = lastWorn(o);
              const woreToday = o.wears.includes(date);
              return (
                <li key={o.id} className="card item-card">
                  <a href={href(`/clothes/outfits/${o.id}`)} className="item-link">
                    <OutfitCollage pieces={pieces} />
                    <div className="item-text">
                      <strong>{outfitName(o)}</strong>
                      <span className="muted small">
                        {pieces.length} {pieces.length === 1 ? 'piece' : 'pieces'} · Worn {wearCount(o)}×
                      </span>
                      <span className="muted small">{last ? `Last worn ${shortDate(last)}` : 'No dated wears'}</span>
                    </div>
                  </a>
                  <button className="btn btn-small" disabled={woreToday} onClick={() => wear(o)}>
                    {woreToday ? 'Worn today ✓' : 'Wore today'}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
