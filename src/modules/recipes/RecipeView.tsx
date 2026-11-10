import { EditIcon, LayersIcon, TrashIcon } from '../../icons';
import { newId } from '../../lib/db';
import { href, navigate } from '../../lib/router';
import { IconMenu } from '../clothes/IconMenu';
import { duplicateRecipe, formatMinutes, totalMinutes } from './recipes';
import type { Recipe } from './types';

interface Props {
  recipe: Recipe;
  onSave: (r: Recipe) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/** One dish: what it is, how long it takes, its ingredients and the steps in order. */
export function RecipeView({ recipe, onSave, onDelete }: Props) {
  const times = [
    recipe.prepTime ? `Prep ${formatMinutes(recipe.prepTime)}` : '',
    recipe.cookTime ? `Cook ${formatMinutes(recipe.cookTime)}` : '',
    recipe.prepTime && recipe.cookTime ? `Total ${formatMinutes(totalMinutes(recipe))}` : '',
  ].filter(Boolean);

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
    <>
      <div className="game-head">
        <div className="recipe-head-text">
          <h1 className="page-title">{recipe.name}</h1>
          <p className="muted small">{[`${recipe.servings} ${recipe.servings === 1 ? 'serving' : 'servings'}`, ...times].join(' · ')}</p>
        </div>
        <a className="icon-btn" href={href(`/recipes/${recipe.id}/edit`)} aria-label="Edit recipe">
          <EditIcon />
        </a>
        <IconMenu
          label="More actions"
          entries={[
            { label: 'Duplicate', icon: <LayersIcon />, onSelect: duplicate },
            { label: 'Delete', icon: <TrashIcon />, onSelect: remove, danger: true },
          ]}
        />
      </div>
      {recipe.tags.length > 0 && (
        <div className="chips recipe-tags">
          {recipe.tags.map((t) => (
            <span key={t} className="chip chip-static">
              {t}
            </span>
          ))}
        </div>
      )}
      {recipe.description && <p className="recipe-description">{recipe.description}</p>}
      {recipe.ingredients.length > 0 && (
        <section className="recipe-section">
          <h2>Ingredients</h2>
          <ul className="recipe-ingredients">
            {recipe.ingredients.map((i) => (
              <li key={i.id}>
                <span>{i.name}</span>
                <span className="muted">{[i.quantity, i.unit === 'piece' && i.quantity !== undefined ? '' : i.unit].filter((x) => x !== undefined && x !== '').join(' ')}{i.optional ? ' · optional' : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="recipe-section">
        <h2>Steps</h2>
        {recipe.steps.length === 0 ? (
          <p className="muted">No steps yet.</p>
        ) : (
          <ol className="recipe-steps">
            {recipe.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
