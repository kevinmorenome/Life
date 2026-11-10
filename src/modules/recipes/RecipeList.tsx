import { PlusIcon } from '../../icons';
import { href } from '../../lib/router';
import { FoodTabs } from '../food/FoodTabs';
import { formatMinutes, sortRecipes, totalMinutes } from './recipes';
import { RecipeThumb } from './RecipeThumb';
import type { Recipe } from './types';

/** Food → Recipes: every dish, by name, with its picture, tags and time. */
export function RecipeList({ recipes }: { recipes: Recipe[] }) {
  const sorted = sortRecipes(recipes);
  return (
    <>
      <FoodTabs active="recipes" />
      {sorted.length === 0 && (
        <div className="empty">
          <p className="muted">No recipes yet. Add the dishes you cook, and later the app will tell you which ones you can make from what you have.</p>
        </div>
      )}
      <ul className="recipe-list">
        {sorted.map((r) => {
          const time = formatMinutes(r.cookTime ?? totalMinutes(r));
          return (
            <li key={r.id}>
              <a className="recipe-row" href={href(`/recipes/${r.id}`)}>
                <RecipeThumb recipe={r} />
                <span className="recipe-row-text">
                  <strong>{r.name}</strong>
                  {(time || r.tags.length > 0) && <span className="muted small">{[time, r.tags.join(', ')].filter(Boolean).join(' · ')}</span>}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      <a className="btn btn-primary game-new" href={href('/recipes/new')}>
        <PlusIcon /> New recipe
      </a>
    </>
  );
}
