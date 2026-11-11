import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CameraIcon, ClockIcon, EditIcon, ForkKnifeIcon, ImageIcon, LayersIcon, MinusIcon, PlusIcon, PotIcon, TrashIcon } from '../../icons';
import { newId } from '../../lib/db';
import { href, navigate } from '../../lib/router';
import { HeartIcon } from '../clothes/icons';
import { IconMenu, type MenuEntry } from '../clothes/IconMenu';
import { checkRecipe, moreText, type IngredientCheck } from './availability';
import { ingredientAmount, scaleIngredients } from './ingredients';
import { RecipePicture } from './RecipePicture';
import { duplicateRecipe, formatMinutes } from './recipes';
import type { Recipe } from './types';
import { usePhotoPicker } from './usePhotoPicker';
import type { Kitchen } from './useKitchen';

interface Props {
  recipe: Recipe;
  kitchen: Pick<Kitchen, 'products' | 'stocked' | 'staples' | 'toggleStaple'>;
  onSave: (r: Recipe) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/** A glass pill with an icon, a value and what it is, like the stat pills under the recipe's name. */
function Pill({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <>
      <span className="recipe-pill-icon">{icon}</span>
      <span className="recipe-pill-text">
        <strong>{value}</strong>
        <span>{label}</span>
      </span>
    </>
  );
}

/** The Servings pill: tap it for − / + to scale the ingredient amounts on this page (the recipe itself stays as it is). */
function ServingsPill({ base, servings, onChange }: { base: number; servings: number; onChange(n: number): void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="menu-wrap recipe-pill-wrap" ref={box}>
      <button type="button" className={`recipe-pill${servings !== base ? ' recipe-pill-on' : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-label={`${servings} servings. Change to scale the ingredients`} onClick={() => setOpen(!open)}>
        <Pill icon={<ForkKnifeIcon />} value={servings} label={servings === 1 ? 'Serving' : 'Servings'} />
      </button>
      {open && (
        <div className="menu recipe-stepper" role="dialog" aria-label="Servings to cook">
          <button type="button" className="icon-btn recipe-lens-btn" aria-label="One serving fewer" disabled={servings <= 1} onClick={() => onChange(Math.max(1, servings - 1))}>
            <MinusIcon />
          </button>
          <span className="recipe-stepper-n" aria-live="polite">
            {servings}
          </span>
          <button type="button" className="icon-btn recipe-lens-btn" aria-label="One serving more" disabled={servings >= 99} onClick={() => onChange(Math.min(99, servings + 1))}>
            <PlusIcon />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One dish: its photo on top (or a drawn pot, with a camera button to add one), the name, three glass pills (servings,
 * prep, cook), the ingredients with boxes to tick off while you cook (on this page only) and the numbered steps.
 * The heart and ⋮ float at the top right; ＋ beside a heading opens the form.
 */
export function RecipeView({ recipe, kitchen, onSave, onDelete }: Props) {
  const [servings, setServings] = useState(recipe.servings);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const scaled = scaleIngredients(recipe.ingredients, recipe.servings, servings);
  const check = checkRecipe(scaled, kitchen.stocked, kitchen.products, kitchen.staples);
  const edit = `/recipes/${recipe.id}/edit`;
  const save = (patch: Partial<Recipe>) => onSave({ ...recipe, ...patch, updatedAt: new Date().toISOString() });
  const picker = usePhotoPicker((photo) => save({ photo }));

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

  const photoEntries: MenuEntry[] = [
    { label: 'Take a photo', icon: <CameraIcon />, onSelect: picker.takePhoto },
    { label: 'Choose a photo', icon: <ImageIcon />, onSelect: picker.choosePhoto },
    ...(recipe.hasPhoto || recipe.photo ? [{ label: 'Remove the photo', icon: <TrashIcon />, danger: true, onSelect: () => void save({ photo: undefined, hasPhoto: false }) }] : []),
  ];

  const toggle = (id: string) =>
    setTicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="recipe-page">
      {picker.inputs}
      <div className="recipe-top">
        <button type="button" className="recipe-glass recipe-top-btn" aria-label={recipe.favorite ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={!!recipe.favorite} onClick={() => void save({ favorite: !recipe.favorite || undefined })}>
          <HeartIcon filled={!!recipe.favorite} />
        </button>
        <IconMenu
          label="More actions"
          triggerClassName="recipe-glass recipe-top-btn"
          entries={[
            { label: 'Edit', icon: <EditIcon />, path: edit },
            { label: 'Duplicate', icon: <LayersIcon />, onSelect: duplicate },
            { label: 'Delete', icon: <TrashIcon />, onSelect: remove, danger: true },
          ]}
        />
      </div>

      <RecipePicture recipe={recipe} className="recipe-hero">
        <span className="recipe-hero-cam">
          <IconMenu entries={photoEntries} label={recipe.hasPhoto ? 'Change the photo' : 'Add a photo'} icon={<CameraIcon />} triggerClassName="recipe-glass recipe-top-btn" />
        </span>
        {picker.busy && <span className="recipe-glass recipe-busy">Saving photo…</span>}
      </RecipePicture>
      {picker.error && (
        <p className="small recipe-ing-error" role="alert">
          {picker.error}
        </p>
      )}

      <h1 className="recipe-title">{recipe.name}</h1>
      {recipe.tags.length > 0 && <p className="muted small recipe-tags-line">{recipe.tags.join(' · ')}</p>}

      <div className="recipe-pills">
        <ServingsPill base={recipe.servings} servings={servings} onChange={setServings} />
        <div className="recipe-pill">
          <Pill icon={<ClockIcon />} value={formatMinutes(recipe.prepTime) || '—'} label="Prep" />
        </div>
        <div className="recipe-pill">
          <Pill icon={<PotIcon />} value={formatMinutes(recipe.cookTime) || '—'} label="Cook" />
        </div>
      </div>

      {recipe.description && <p className="recipe-description">{recipe.description}</p>}

      <section className="recipe-section" aria-label="Ingredients">
        <div className="recipe-section-head">
          <h2>Ingredients</h2>
          <a className="icon-action recipe-add" href={href(edit)} aria-label="Add or change ingredients">
            <PlusIcon />
          </a>
        </div>
        {servings !== recipe.servings && (
          <p className="muted small recipe-scaled">
            Amounts for {servings} instead of {recipe.servings}.{' '}
            <button type="button" className="recipe-reset" onClick={() => setServings(recipe.servings)}>
              Back to {recipe.servings}
            </button>
          </p>
        )}
        {recipe.ingredients.length > 0 && <StockSummary lacking={check.lacking} />}
        {recipe.ingredients.length === 0 ? (
          <p className="muted small recipe-empty">No ingredients yet. Tap ＋ to add them.</p>
        ) : (
          <ul className="recipe-ingredients">
            {check.items.map((c) => {
              const i = c.ingredient;
              return (
                <li key={i.id} className={ticked.has(i.id) ? 'is-ticked' : undefined}>
                  <label>
                    <input type="checkbox" className="recipe-check" checked={ticked.has(i.id)} onChange={() => toggle(i.id)} aria-label={`${i.name}: done`} />
                    <span className="recipe-ing-text">
                      {i.name}
                      {i.optional && ' (optional)'}
                      {i.notes && <span className="muted small recipe-ing-notes">{i.notes}</span>}
                    </span>
                    <span className="muted recipe-ing-qty">{ingredientAmount(i)}</span>
                  </label>
                  <StockStatus check={c} onStaple={() => void kitchen.toggleStaple(i.name)} editPath={edit} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="recipe-section" aria-label="Steps">
        <div className="recipe-section-head">
          <h2>Steps</h2>
          <a className="icon-action recipe-add" href={href(edit)} aria-label="Add or change steps">
            <PlusIcon />
          </a>
        </div>
        {recipe.steps.length === 0 ? (
          <p className="muted small recipe-empty">No steps yet. Tap ＋ to add them.</p>
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

/** Above the ingredients: whether the stock covers the recipe, in words. */
function StockSummary({ lacking }: { lacking: IngredientCheck[] }) {
  if (!lacking.length)
    return (
      <p className="small recipe-summary tone-green" role="status">
        You have everything for this.
      </p>
    );
  const names = lacking.map((c) => c.ingredient.name);
  const list = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(names.length === 2 ? ' and ' : ', ');
  return (
    <p className="small recipe-summary tone-orange" role="status">
      {lacking.length === 1 ? 'Lacking 1 thing' : `Lacking ${lacking.length} things`}: {list}.
    </p>
  );
}

/**
 * Under an ingredient's amount: what the stock says, as a badge with words (never colour alone). Tapping it opens a
 * menu to mark the ingredient as always in the pantry (or not), or to link it to a product in the form.
 */
function StockStatus({ check: c, onStaple, editPath }: { check: IngredientCheck; onStaple(): void; editPath: string }) {
  const unit = c.ingredient.unit;
  const [text, tone] = c.staple
    ? ['Always have', 'grey']
    : c.state === 'available'
      ? [c.unverified ? 'In stock · not measured' : 'In stock', 'green']
      : c.state === 'partial'
        ? [`Need ${moreText(c.more ?? 0, unit)}`, 'orange']
        : c.ingredient.optional
          ? ['None · optional', 'grey']
          : ['Missing', 'red'];
  const from = c.product && !c.staple ? `${c.matched ? 'Matched' : 'Linked'} to ${c.product.name}` : undefined;
  const entries: MenuEntry[] = [
    { label: c.staple ? 'Not always in my pantry' : 'Always in my pantry', icon: <PotIcon />, onSelect: onStaple },
    { label: c.product && !c.matched ? 'Change the product…' : 'Link to a product…', icon: <EditIcon />, path: editPath },
  ];
  return (
    <div className="recipe-status">
      {from && <span className="muted recipe-status-from">{from}</span>}
      <IconMenu entries={entries} label={`${c.ingredient.name}: ${text}. Options`} icon={<span className={`sbadge tone-${tone}`}>{text}</span>} triggerClassName="recipe-status-btn" />
    </div>
  );
}
