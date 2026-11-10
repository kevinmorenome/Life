import type { Recipe } from './types';

/** The recipe's picture on the list. Photos come with #206; until then (and without one) a placeholder with its initial. */
export function RecipeThumb({ recipe }: { recipe: Recipe }) {
  return (
    <span className="recipe-thumb" aria-hidden="true">
      {recipe.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
