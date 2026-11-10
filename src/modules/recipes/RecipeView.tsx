import { EditIcon, LayersIcon, TrashIcon } from '../../icons';
import { newId } from '../../lib/db';
import { href, navigate } from '../../lib/router';
import { IconMenu } from '../clothes/IconMenu';
import { duplicateRecipe, formatMinutes } from './recipes';
import { RecipeThumb } from './RecipeThumb';
import type { Recipe, RecipeIngredient } from './types';

interface Props {
  recipe: Recipe;
  onSave: (r: Recipe) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const amount = (i: RecipeIngredient): string =>
  i.quantity === undefined ? (i.unit === 'piece' ? '' : i.unit) : i.unit === 'piece' ? String(i.quantity) : `${i.quantity} ${i.unit}`;

/**
 * One dish, laid out like a product page: picture and name on top with the edit and ⋮ lenses, three stat tiles
 * (servings, prep, cook), then the ingredients and the numbered steps as flat hairline sections.
 */
export function RecipeView({ recipe, onSave, onDelete }: Props) {
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
          {recipe.ingredients.length > 0 && <span className="muted small">{recipe.ingredients.length} {recipe.ingredients.length === 1 ? 'item' : 'items'}</span>}
        </div>
        {recipe.ingredients.length === 0 ? (
          <p className="muted small pstock-empty">No ingredients yet.</p>
        ) : (
          <ul className="recipe-ingredients">
            {recipe.ingredients.map((i) => (
              <li key={i.id}>
                <span>
                  {i.name}
                  {i.optional && <span className="muted small"> · optional</span>}
                </span>
                <span className="muted">{amount(i)}</span>
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
