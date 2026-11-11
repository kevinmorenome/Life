import { useCollection } from '../../lib/useCollection';
import { CookView } from './CookView';
import { RecipeForm } from './RecipeForm';
import { RecipeList } from './RecipeList';
import { allTags } from './recipes';
import { RecipeView } from './RecipeView';
import type { Recipe } from './types';
import { useKitchen } from './useKitchen';

/** `#/recipes`, `#/recipes/new`, `#/recipes/<id>`, `#/recipes/<id>/edit`. */
export function RecipesRoot({ subroute }: { subroute: string[] }) {
  const recipes = useCollection<Recipe>('recipes');
  const kitchen = useKitchen();
  const [first, second, third] = subroute;

  if (recipes.loading || kitchen.loading) return <p className="muted">Loading…</p>;
  const tags = allTags(recipes.items);
  if (first === 'new') return <RecipeForm knownTags={tags} kitchen={kitchen} onSave={recipes.save} />;
  if (first) {
    const recipe = recipes.items.find((r) => r.id === first);
    if (!recipe) return <p className="muted">That recipe doesn’t exist anymore.</p>;
    if (second === 'cook') return <CookView key={recipe.id} recipe={recipe} servings={Math.max(1, Math.min(99, Number(third) || recipe.servings))} kitchen={kitchen} onSave={recipes.save} />;
    if (second === 'edit') return <RecipeForm key={recipe.id} existing={recipe} knownTags={tags} kitchen={kitchen} onSave={recipes.save} />;
    return <RecipeView recipe={recipe} kitchen={kitchen} onSave={recipes.save} onDelete={recipes.remove} />;
  }
  return <RecipeList recipes={recipes.items} onSave={recipes.save} />;
}
