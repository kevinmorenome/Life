import { href } from '../../lib/router';
import { FoodTabs } from '../food/FoodTabs';
import { formatMinutes, sortRecipes, totalMinutes } from './recipes';
import { RecipeThumb } from './RecipeThumb';
import type { Recipe } from './types';

/** Food → Recipes: a grid of dishes like the stock grid, each with its time on a glass badge. New ones come from ＋. */
export function RecipeList({ recipes }: { recipes: Recipe[] }) {
  const sorted = sortRecipes(recipes);
  return (
    <>
      <FoodTabs active="recipes" />
      {sorted.length === 0 ? (
        <div className="empty">
          <p className="muted">No recipes yet. Add the dishes you cook, and later the app will tell you which ones you can make from what you have.</p>
          <a className="btn btn-primary" href={href('/recipes/new')}>
            New recipe
          </a>
        </div>
      ) : (
        <ul className="food-grid recipe-grid">
          {sorted.map((r) => {
            const time = formatMinutes(totalMinutes(r));
            return (
              <li key={r.id}>
                <a className="food-tile recipe-tile" href={href(`/recipes/${r.id}`)}>
                  <RecipeThumb recipe={r}>{time && <span className="food-badge recipe-badge">{time}</span>}</RecipeThumb>
                  <span className="food-name">{r.name}</span>
                  {r.tags.length > 0 && <span className="recipe-tile-tags muted">{r.tags.join(' · ')}</span>}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
