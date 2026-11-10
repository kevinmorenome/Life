import { useState, type FormEvent } from 'react';
import { ChevronIcon, PlusIcon, TrashIcon } from '../../icons';
import { newId } from '../../lib/db';
import { navigate } from '../../lib/router';
import { cleanSteps, moveItem, parseTags } from './recipes';
import type { Recipe } from './types';

interface Props {
  existing?: Recipe;
  onSave: (r: Recipe) => Promise<void>;
}

const minutes = (text: string): number | undefined => {
  const n = Math.round(Number(text));
  return text.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};

/** New or edit: name, description, servings, times, tags and the steps in order. Ingredients come with #205. */
export function RecipeForm({ existing, onSave }: Props) {
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [servings, setServings] = useState(String(existing?.servings ?? 2));
  const [prep, setPrep] = useState(existing?.prepTime ? String(existing.prepTime) : '');
  const [cook, setCook] = useState(existing?.cookTime ? String(existing.cookTime) : '');
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '');
  const [steps, setSteps] = useState<string[]>(existing?.steps.length ? existing.steps : ['']);
  const back = existing ? `/recipes/${existing.id}` : '/recipes';

  const setStep = (i: number, text: string) => setSteps((cur) => cur.map((s, j) => (j === i ? text : s)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const now = new Date().toISOString();
    const recipe: Recipe = {
      ingredients: [],
      ...existing,
      id: existing?.id ?? newId(),
      name: name.trim(),
      description: description.trim() || undefined,
      servings: Math.max(1, Math.round(Number(servings)) || 1),
      prepTime: minutes(prep),
      cookTime: minutes(cook),
      tags: parseTags(tags),
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
