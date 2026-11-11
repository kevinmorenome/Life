import { useState } from 'react';
import { EditIcon, LayersIcon, MinusIcon, PlusIcon, TrashIcon } from '../../icons';
import { newId } from '../../lib/db';
import { href, navigate } from '../../lib/router';
import { IconMenu } from '../clothes/IconMenu';
import { ingredientAmount, scaleIngredients } from './ingredients';
import { duplicateRecipe, formatMinutes } from './recipes';
import { RecipeThumb } from './RecipeThumb';
import type { Recipe } from './types';

interface Props {
  recipe: Recipe;
  onSave: (r: Recipe) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/**
 * One dish, laid out like a product page: picture and name on top with the edit and ⋮ lenses, three stat tiles
 * (servings, prep, cook), then the ingredients and the numbered steps as flat hairline sections. The − / + beside
 * Ingredients scales the amounts to another number of servings, on this page only: the recipe itself is unchanged.
 */
export function RecipeView({ recipe, onSave, onDelete }: Props) {
  const [servings, setServings] = useState(recipe.servings);
  const scaled = scaleIngredients(recipe.ingredients, recipe.servings, servings);
  async function duplicate() {
    const copy = duplicateRecipe(recipe, newId, new Date().toISOString());
    await onSave(copy);
    navigate(`/recipes/${copy.id}/edit`);
  }

  async function remove() {
    if (!window.confirm(`Delete “${recipe.name}”? Its ingredients and photo go with it; your stock isn’t touched.`)) return;
    await onDelete(recipe.id);
    navigate('/recipes');
  }

  return (
    <div className="pstock recipe-page">
      <header className="pstock-head">
        <RecipeThumb recipe={recipe} big />
        <div className="pstock-text">
          <h1 className="pstock-name">{recipe.name}</h1>
          {recipe.tags.length > 0 && <p className="muted small pstock-where">{recipe.tags.join(' · ')}</p>}
        </div>
        <span className="recipe-head-actions">
          <a className="icon-action recipe-lens" href={href(`/recipes/${recipe.id}/edit`)} aria-label="Edit recipe">
            <EditIcon />
          </a>
          <IconMenu
            label="More actions"
            triggerClassName="icon-action recipe-lens"
            entries={[
              { label: 'Duplicate', icon: <LayersIcon />, onSelect: duplicate },
              { label: 'Delete', icon: <TrashIcon />, onSelect: remove, danger: true },
            ]}
          />
        </span>
      </header>

      <dl className="pstock-stats">
        <div>
          <dd>{recipe.servings}</dd>
          <dt>{recipe.servings === 1 ? 'Serving' : 'Servings'}</dt>
        </div>
        <div>
          <dd>{formatMinutes(recipe.prepTime) || '—'}</dd>
          <dt>Prep</dt>
        </div>
        <div>
          <dd>{formatMinutes(recipe.cookTime) || '—'}</dd>
          <dt>Cook</dt>
        </div>
      </dl>

      {recipe.description && <p className="recipe-description">{recipe.description}</p>}

      <section className="pstock-section" aria-label="Ingredients">
        <div className="pstock-section-head">
          <h2>Ingredients</h2>
          {recipe.ingredients.length > 0 && (
            <span className="recipe-serves" role="group" aria-label="Servings to cook">
              <button type="button" className="icon-btn recipe-lens-btn" aria-label="One serving fewer" disabled={servings <= 1} onClick={() => setServings((n) => Math.max(1, n - 1))}>
                <MinusIcon />
              </button>
              <span className="recipe-serves-n" aria-live="polite">
                {servings} {servings === 1 ? 'serving' : 'servings'}
              </span>
              <button type="button" className="icon-btn recipe-lens-btn" aria-label="One serving more" disabled={servings >= 99} onClick={() => setServings((n) => Math.min(99, n + 1))}>
                <PlusIcon />
              </button>
            </span>
          )}
        </div>
        {servings !== recipe.servings && (
          <p className="muted small recipe-scaled">
            Amounts for {servings} instead of {recipe.servings}.{' '}
            <button type="button" className="recipe-reset" onClick={() => setServings(recipe.servings)}>
              Back to {recipe.servings}
            </button>
          </p>
        )}
        {recipe.ingredients.length === 0 ? (
          <p className="muted small pstock-empty">No ingredients yet. Add them with the edit button above.</p>
        ) : (
          <ul className="recipe-ingredients">
            {scaled.map((i) => (
              <li key={i.id}>
                <span>
                  {i.name}
                  {i.optional && <span className="muted small"> · optional</span>}
                  {i.notes && <span className="muted small recipe-ing-notes">{i.notes}</span>}
                </span>
                <span className="muted">{ingredientAmount(i)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pstock-section" aria-label="Steps">
        <div className="pstock-section-head">
          <h2>Steps</h2>
          {recipe.steps.length > 0 && <span className="muted small">{recipe.steps.length} {recipe.steps.length === 1 ? 'step' : 'steps'}</span>}
        </div>
        {recipe.steps.length === 0 ? (
          <p className="muted small pstock-empty">No steps yet.</p>
        ) : (
          <ol className="recipe-steps">
            {recipe.steps.map((s, i) => (
              <li key={i}>
                <span className="recipe-step-no" aria-hidden="true">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
