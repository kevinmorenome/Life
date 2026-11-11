import { useState } from 'react';
import { ClockIcon, SearchIcon } from '../../icons';
import { href } from '../../lib/router';
import { HeartIcon, SlidersIcon } from '../clothes/icons';
import { FoodTabs } from '../food/FoodTabs';
import { RecipePicture } from './RecipePicture';
import { allTags, filterCount, formatMinutes, NO_FILTER, searchRecipes, totalMinutes, type RecipeFilter } from './recipes';
import type { Recipe } from './types';

interface Props {
  recipes: Recipe[];
  onSave: (r: Recipe) => Promise<void>;
}

/**
 * Food → Recipes: a search bar with a filter button (tags, favourites), then the dishes as photo cards, two per row,
 * favourites first. Each photo carries glass controls: the time on the left, a heart on the right. New ones come from ＋.
 */
export function RecipeList({ recipes, onSave }: Props) {
  const [filter, setFilter] = useState<RecipeFilter>(NO_FILTER);
  const [showFilters, setShowFilters] = useState(false);
  const shown = searchRecipes(recipes, filter);
  const tags = allTags(recipes);
  const active = filterCount(filter);

  const toggleTag = (t: string) => setFilter((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }));
  const favorite = (r: Recipe) => onSave({ ...r, favorite: !r.favorite || undefined, updatedAt: new Date().toISOString() });

  return (
    <>
      <FoodTabs active="recipes" />
      {recipes.length === 0 ? (
        <div className="empty">
          <p className="muted">No recipes yet. Add the dishes you cook, and later the app will tell you which ones you can make from what you have.</p>
          <a className="btn btn-primary" href={href('/recipes/new')}>
            New recipe
          </a>
        </div>
      ) : (
        <>
          <div className="search-row recipe-search">
            <label className="recipe-search-box">
              <SearchIcon />
              <input type="search" value={filter.text} onChange={(e) => setFilter((f) => ({ ...f, text: e.target.value }))} placeholder="Search recipes…" aria-label="Search recipes by name or ingredient" />
            </label>
            <button type="button" className="filter-btn recipe-filter-btn" aria-label="Filter recipes" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
              <SlidersIcon />
              {active > 0 && <span className="filter-count">{active}</span>}
            </button>
          </div>
          {showFilters && (
            <div className="chips recipe-filter-chips" role="group" aria-label="Filters">
              <button type="button" className="chip chip-icon" aria-pressed={filter.favorites} onClick={() => setFilter((f) => ({ ...f, favorites: !f.favorites }))}>
                <HeartIcon filled={filter.favorites} /> Favourites
              </button>
              {tags.map((t) => (
                <button key={t} type="button" className="chip" aria-pressed={filter.tags.includes(t)} onClick={() => toggleTag(t)}>
                  {t}
                </button>
              ))}
              {active > 0 && (
                <button type="button" className="recipe-reset" onClick={() => setFilter((f) => ({ ...f, tags: [], favorites: false }))}>
                  Clear
                </button>
              )}
            </div>
          )}
          {shown.length === 0 && <p className="muted recipe-none">No recipes match.</p>}
          <ul className="recipe-cards">
            {shown.map((r) => {
              const time = formatMinutes(totalMinutes(r));
              return (
                <li key={r.id} className="recipe-card">
                  <a className="recipe-card-link" href={href(`/recipes/${r.id}`)}>
                    <RecipePicture recipe={r} className="recipe-card-pic">
                      {time && (
                        <span className="recipe-glass recipe-time">
                          <ClockIcon /> {time}
                        </span>
                      )}
                    </RecipePicture>
                    <span className="recipe-card-name">{r.name}</span>
                    <span className="recipe-card-meta muted">
                      {r.servings} {r.servings === 1 ? 'serving' : 'servings'}
                    </span>
                  </a>
                  <button type="button" className="recipe-glass recipe-heart" aria-label={r.favorite ? `Remove ${r.name} from favourites` : `Add ${r.name} to favourites`} aria-pressed={!!r.favorite} onClick={() => void favorite(r)}>
                    <HeartIcon filled={!!r.favorite} />
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
