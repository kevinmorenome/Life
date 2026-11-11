import { useState, type FormEvent } from 'react';
import { ChevronIcon, PlusIcon, TrashIcon } from '../../icons';
import { newId } from '../../lib/db';
import { navigate } from '../../lib/router';
import { badQuantities, fromDrafts, isMeasured, toDraft, type IngredientDraft } from './ingredients';
import { cleanSteps, moveItem, parseTags } from './recipes';
import { RECIPE_UNIT_LABELS, RECIPE_UNITS, type Recipe, type RecipeUnit } from './types';

interface Props {
  existing?: Recipe;
  onSave: (r: Recipe) => Promise<void>;
}

const blankIngredient = (): IngredientDraft => ({ id: newId(), name: '', quantity: '', unit: 'g', optional: false, notes: '' });

const minutes = (text: string): number | undefined => {
  const n = Math.round(Number(text));
  return text.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};

/** New or edit: name, description, servings, times, tags, the ingredients with their amounts, and the steps in order. */
export function RecipeForm({ existing, onSave }: Props) {
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [servings, setServings] = useState(String(existing?.servings ?? 2));
  const [prep, setPrep] = useState(existing?.prepTime ? String(existing.prepTime) : '');
  const [cook, setCook] = useState(existing?.cookTime ? String(existing.cookTime) : '');
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '');
  const [steps, setSteps] = useState<string[]>(existing?.steps.length ? existing.steps : ['']);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(() => (existing?.ingredients.length ? existing.ingredients.map(toDraft) : [blankIngredient()]));
  const [showErrors, setShowErrors] = useState(false);
  const bad = badQuantities(ingredients);
  const back = existing ? `/recipes/${existing.id}` : '/recipes';

  const setStep = (i: number, text: string) => setSteps((cur) => cur.map((s, j) => (j === i ? text : s)));
  const setIngredient = (id: string, patch: Partial<IngredientDraft>) => setIngredients((cur) => cur.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const removeIngredient = (id: string) => setIngredients((cur) => (cur.length === 1 ? [blankIngredient()] : cur.filter((d) => d.id !== id)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (bad.length) {
      setShowErrors(true);
      document.getElementById(`ing-q-${bad[0]}`)?.focus();
      return;
    }
    const now = new Date().toISOString();
    const recipe: Recipe = {
      ...existing,
      id: existing?.id ?? newId(),
      name: name.trim(),
      description: description.trim() || undefined,
      servings: Math.max(1, Math.round(Number(servings)) || 1),
      prepTime: minutes(prep),
      cookTime: minutes(cook),
      tags: parseTags(tags),
      ingredients: fromDrafts(ingredients),
      steps: cleanSteps(steps),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await onSave(recipe);
    navigate(`/recipes/${recipe.id}`);
  }

  return (
    <form className="form" onSubmit={submit}>
      <h1>{existing ? 'Edit recipe' : 'New recipe'}</h1>
      <label className="field">
        <span>Name</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Pasta with tomato sauce" />
      </label>
      <label className="field">
        <span>Description (optional)</span>
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="field-grid recipe-numbers">
        <label className="field">
          <span>Servings</span>
          <input type="number" inputMode="numeric" min={1} step={1} required value={servings} onChange={(e) => setServings(e.target.value)} />
        </label>
        <label className="field">
          <span>Prep (min)</span>
          <input type="number" inputMode="numeric" min={0} step={1} value={prep} onChange={(e) => setPrep(e.target.value)} />
        </label>
        <label className="field">
          <span>Cook (min)</span>
          <input type="number" inputMode="numeric" min={0} step={1} value={cook} onChange={(e) => setCook(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Tags, separated by commas</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="dinner, quick, vegetarian" />
      </label>
      <div className="field">
        <span>Ingredients</span>
        <ul className="recipe-ing-edit">
          {ingredients.map((d, i) => {
            const invalid = showErrors && bad.includes(d.id);
            return (
              <li key={d.id}>
                <input
                  className="recipe-ing-name"
                  value={d.name}
                  onChange={(e) => setIngredient(d.id, { name: e.target.value })}
                  placeholder={i === 0 ? 'Tortellini' : 'Ingredient'}
                  aria-label={`Ingredient ${i + 1}`}
                  autoComplete="off"
                />
                <div className="recipe-ing-amount">
                  <input
                    id={`ing-q-${d.id}`}
                    value={isMeasured(d.unit) || d.unit === 'pinch' ? d.quantity : ''}
                    disabled={d.unit === 'to taste'}
                    onChange={(e) => setIngredient(d.id, { quantity: e.target.value })}
                    inputMode="decimal"
                    placeholder={d.unit === 'to taste' ? '—' : 'Amount'}
                    aria-label={`Amount of ingredient ${i + 1}`}
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? `ing-err-${d.id}` : undefined}
                  />
                  <select value={d.unit} onChange={(e) => setIngredient(d.id, { unit: e.target.value as RecipeUnit })} aria-label={`Unit of ingredient ${i + 1}`}>
                    {RECIPE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {RECIPE_UNIT_LABELS[u]}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="chip recipe-ing-opt" aria-pressed={d.optional} onClick={() => setIngredient(d.id, { optional: !d.optional })}>
                    Optional
                  </button>
                  <button type="button" className="icon-btn recipe-lens-btn" aria-label={`Remove ingredient ${i + 1}`} onClick={() => removeIngredient(d.id)}>
                    <TrashIcon />
                  </button>
                </div>
                {invalid && (
                  <p id={`ing-err-${d.id}`} className="small recipe-ing-error" role="alert">
                    Can’t read this amount. Use a number like 200, 0.5, 1/2 or 1½.
                  </p>
                )}
                <input
                  className="recipe-ing-note"
                  value={d.notes}
                  onChange={(e) => setIngredient(d.id, { notes: e.target.value })}
                  placeholder="Note, e.g. finely chopped (optional)"
                  aria-label={`Note for ingredient ${i + 1}`}
                />
              </li>
            );
          })}
        </ul>
        <button type="button" className="icon-btn recipe-add-step" aria-label="Add an ingredient" onClick={() => setIngredients((cur) => [...cur, blankIngredient()])}>
          <PlusIcon />
        </button>
      </div>
      <div className="field">
        <span>Steps</span>
        <ol className="recipe-step-edit">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="recipe-step-no" aria-hidden="true">
                {i + 1}
              </span>
              <textarea rows={2} value={s} onChange={(e) => setStep(i, e.target.value)} aria-label={`Step ${i + 1}`} />
              <span className="recipe-step-actions">
                <button type="button" className="icon-btn recipe-up" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => setSteps((cur) => moveItem(cur, i, -1))}>
                  <ChevronIcon />
                </button>
                <button type="button" className="icon-btn" aria-label={`Move step ${i + 1} down`} disabled={i === steps.length - 1} onClick={() => setSteps((cur) => moveItem(cur, i, 1))}>
                  <ChevronIcon />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove step ${i + 1}`}
                  onClick={() => setSteps((cur) => (cur.length === 1 ? [''] : cur.filter((_, j) => j !== i)))}
                >
                  <TrashIcon />
                </button>
              </span>
            </li>
          ))}
        </ol>
        <button type="button" className="icon-btn recipe-add-step" aria-label="Add a step" onClick={() => setSteps((cur) => [...cur, ''])}>
          <PlusIcon />
        </button>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(back)}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!name.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}
