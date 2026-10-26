import { useMemo, useState } from 'react';
import { href } from '../../lib/router';
import { FavMark } from './ClothesList';
import { HeartIcon } from './icons';
import { OutfitBoard } from './OutfitBoard';
import { outfitName, outfitPieces } from './outfits';
import { lastWorn, wearCount } from './stats';
import type { ClothingItem, Outfit } from './types';

type Sort = 'recent-worn' | 'most-worn' | 'newest';

export function OutfitList({ outfits, items }: { outfits: Outfit[]; items: ClothingItem[] }) {
  const [sort, setSort] = useState<Sort>('recent-worn');
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return outfits
      .filter((o) => (!favoritesOnly || o.favorite) && (!q || [outfitName(o), ...(o.tags ?? [])].some((f) => f.toLowerCase().includes(q))))
      .sort((a, b) => {
        if (sort === 'most-worn') return wearCount(b) - wearCount(a);
        if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt);
        return (lastWorn(b) ?? '').localeCompare(lastWorn(a) ?? '');
      });
  }, [outfits, query, sort, favoritesOnly]);

  return (
    <>
      {outfits.length === 0 ? (
        <div className="empty">
          <p>No outfits yet.</p>
          <a className="btn btn-primary" href={href('/clothes/outfits/new')}>
            Put one together
          </a>
        </div>
      ) : (
        <>
          <div className="filters filter-row-2 filter-row-fav">
            <input type="search" placeholder="Search outfits or tags…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="recent-worn">Recently worn</option>
              <option value="most-worn">Most worn</option>
              <option value="newest">Newest</option>
            </select>
            <button
              type="button"
              className="fav-toggle"
              aria-label="Favorites only"
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly(!favoritesOnly)}
            >
              <HeartIcon filled={favoritesOnly} />
            </button>
          </div>
          <p className="muted small">
            {visible.length} of {outfits.length} outfits
          </p>
          {visible.length === 0 ? (
            <p className="muted empty">No outfits match.</p>
          ) : (
            <ul className="outfit-cards">
              {visible.map((o) => {
                const worn = wearCount(o);
                return (
                  <li key={o.id}>
                    <a
                      href={href(`/clothes/outfits/${o.id}`)}
                      className="outfit-card"
                      aria-label={`${outfitName(o)}, worn ${worn} times`}
                    >
                      <OutfitBoard pieces={outfitPieces(o, items)} />
                      {o.favorite && <FavMark />}
                      {worn > 0 && <span className="worn-badge">{worn}×</span>}
                      {o.name && <span className="outfit-card-name">{o.name}</span>}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
