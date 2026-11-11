import { useCollection } from '../../lib/useCollection';
import { RecipeForm } from './RecipeForm';
import { RecipeList } from './RecipeList';
import { allTags } from './recipes';
import { RecipeView } from './RecipeView';
import type { Recipe } from './types';

/** `#/recipes`, `#/recipes/new`, `#/recipes/<id>`, `#/recipes/<id>/edit`. */
export function RecipesRoot({ subroute }: { subroute: string[] }) {
  const recipes = useCollection<Recipe>('recipes');
  const [first, second] = subroute;

  if (recipes.loading) return <p className="muted">Loading…</p>;
  const tags = allTags(recipes.items);
  if (first === 'new') return <RecipeForm knownTags={tags} onSave={recipes.save} />;
  if (first) {
    const recipe = recipes.items.find((r) => r.id === first);
    if (!recipe) return <p className="muted">That recipe doesn’t exist anymore.</p>;
    if (second === 'edit') return <RecipeForm key={recipe.id} existing={recipe} knownTags={tags} onSave={recipes.save} />;
    return <RecipeView recipe={recipe} onSave={recipes.save} onDelete={recipes.remove} />;
  }
  return <RecipeList recipes={recipes.items} onSave={recipes.save} />;
}
