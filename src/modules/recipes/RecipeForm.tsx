import { useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { CartIcon, CameraIcon, ForkKnifeIcon, GripIcon, ImageIcon, ListIcon, PlusIcon, PotIcon, TagIcon, TrashIcon } from '../../icons';
import { newId } from '../../lib/db';
import { navigate } from '../../lib/router';
import { IconMenu, type MenuEntry } from '../clothes/IconMenu';
import { PencilIcon } from '../clothes/icons';
import { matchProduct, stapleKey, suggestProducts } from './availability';
import { badAmounts, fromDrafts, toDraft, type IngredientDraft } from './ingredients';
import { RecipePicture } from './RecipePicture';
import { cleanSteps, moveItem, parseTags } from './recipes';
import type { Recipe } from './types';
import { usePhotoPicker } from './usePhotoPicker';
import type { Kitchen } from './useKitchen';

interface Props {
  existing?: Recipe;
  /** Tags used by any recipe, offered as chips under the field. */
  knownTags?: string[];
  /** Products bought and the pantry staples, to link ingredients to. */
  kitchen?: Pick<Kitchen, 'products' | 'staples'>;
  onSave: (r: Recipe) => Promise<void>;
}

const minutes = (text: string): number | undefined => {
  const n = Math.round(Number(text));
  return text.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};

const blankIngredient = (): IngredientDraft => ({ id: newId(), name: '', amount: '' });

/** A step as the form holds it: an id, so a row keeps its text field while it is dragged. */
interface StepDraft {
  id: string;
  text: string;
}
const blankStep = (): StepDraft => ({ id: newId(), text: '' });

/**
 * New or edit: Save sits in a sticky glass bar at the top; the photo tile beside the name and description; servings and
 * times; tags (typed, or tapped from the ones in use); ingredients as a name and an amount ("250 g", "1/2 cup",
 * "to taste"; "(optional)" after the name); steps you drag by the grip. Empty rows are left out when saving.
 */
export function RecipeForm({ existing, knownTags = [], kitchen, onSave }: Props) {
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [servings, setServings] = useState(String(existing?.servings ?? 2));
  const [prep, setPrep] = useState(existing?.prepTime ? String(existing.prepTime) : '');
  const [cook, setCook] = useState(existing?.cookTime ? String(existing.cookTime) : '');
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '');
  const [steps, setSteps] = useState<StepDraft[]>(() => (existing?.steps.length ? existing.steps.map((text) => ({ id: newId(), text })) : [blankStep()]));
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(() => (existing?.ingredients.length ? existing.ingredients.map(toDraft) : [blankIngredient()]));
  /** undefined = keep the stored photo, a string = the new one, null = removed. */
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [showErrors, setShowErrors] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  /** The ingredient whose name field has focus: it shows product suggestions. */
  const [typing, setTyping] = useState<string | null>(null);
  const products = kitchen?.products ?? [];
  const stepList = useRef<HTMLOListElement>(null);
  const picker = usePhotoPicker((p) => setPhoto(p));
  const bad = badAmounts(ingredients);
  const back = existing ? `/recipes/${existing.id}` : '/recipes';
  const typedTags = parseTags(tags);
  const hasPhoto = photo === undefined ? Boolean(existing?.hasPhoto || existing?.photo) : photo !== null;

  const setIngredient = (id: string, patch: Partial<IngredientDraft>) => setIngredients((cur) => cur.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const setStep = (id: string, text: string) => setSteps((cur) => cur.map((s) => (s.id === id ? { ...s, text } : s)));
  const focusLater = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);

  function addIngredient() {
    const d = blankIngredient();
    setIngredients((cur) => [...cur, d]);
    focusLater(`ing-n-${d.id}`);
  }
  function addStep() {
    const s = blankStep();
    setSteps((cur) => [...cur, s]);
    focusLater(`step-${s.id}`);
  }
  /** Links an ingredient row to a product: the row takes the product's name (keeping "(optional)"), then the amount gets focus. */
  function pick(d: IngredientDraft, p: Kitchen['products'][number]) {
    const optional = /\(optional\)\s*$/i.test(d.name);
    setIngredient(d.id, { name: optional ? `${p.name} (optional)` : p.name, productId: p.id });
    setTyping(null);
    document.getElementById(`ing-a-${d.id}`)?.focus();
  }
  const addTag = (t: string) => setTags(typedTags.length ? `${typedTags.join(', ')}, ${t}` : t);

  // Dragging a step by its grip: the row under the finger takes its place as it moves.
  function startDrag(e: PointerEvent<HTMLButtonElement>, id: string) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(id);
  }
  function moveDrag(e: PointerEvent<HTMLButtonElement>) {
    if (!dragging || !stepList.current) return;
    const rows = [...stepList.current.children] as HTMLElement[];
    const over = rows.findIndex((row) => {
      const r = row.getBoundingClientRect();
      return e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (over === -1) return;
    setSteps((cur) => {
      const from = cur.findIndex((s) => s.id === dragging);
      if (from === over || from === -1) return cur;
      const next = cur.slice();
      const [moved] = next.splice(from, 1);
      next.splice(over, 0, moved);
      return next;
    });
  }
  function keyMove(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    setSteps((cur) => moveItem(cur, index, e.key === 'ArrowUp' ? -1 : 1));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (bad.length) {
      setShowErrors(true);
      document.getElementById(`ing-a-${bad[0]}`)?.focus();
      return;
    }
    const now = new Date().toISOString();
    const { photo: _stored, ...rest } = existing ?? ({} as Partial<Recipe>);
    const recipe: Recipe = {
      ...rest,
      ...(photo ? { photo } : photo === null ? { hasPhoto: false } : {}),
      id: existing?.id ?? newId(),
      name: name.trim(),
      description: description.trim() || undefined,
      servings: Math.max(1, Math.round(Number(servings)) || 1),
      prepTime: minutes(prep),
      cookTime: minutes(cook),
      tags: typedTags,
      ingredients: fromDrafts(ingredients),
      steps: cleanSteps(steps.map((s) => s.text)),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await onSave(recipe);
    navigate(`/recipes/${recipe.id}`);
  }

  const photoEntries: MenuEntry[] = [
    { label: 'Take a photo', icon: <CameraIcon />, onSelect: picker.takePhoto },
    { label: 'Choose a photo', icon: <ImageIcon />, onSelect: picker.choosePhoto },
    ...(hasPhoto ? [{ label: 'Remove the photo', icon: <TrashIcon />, danger: true, onSelect: () => setPhoto(null) }] : []),
  ];

  return (
    <form className="form recipe-form" onSubmit={submit}>
      {picker.inputs}
      <div className="recipe-form-bar">
        <h1>{existing ? 'Edit recipe' : 'New recipe'}</h1>
        <button type="button" className="btn btn-ghost" onClick={() => navigate(back)}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!name.trim() || picker.busy}>
          Save
        </button>
      </div>

      <div className="recipe-form-top">
        <div className="recipe-photo-field">
          <IconMenu
            entries={photoEntries}
            label={hasPhoto ? 'Change the photo' : 'Add a photo'}
            triggerClassName="recipe-photo-btn"
            icon={
              <RecipePicture recipe={existing} photo={photo} className="recipe-photo-pic">
                {!hasPhoto && (
                  <span className="recipe-photo-add">
                    <CameraIcon />
                    {picker.busy ? 'Adding…' : 'Add photo'}
                  </span>
                )}
                {hasPhoto && (
                  <span className="recipe-glass recipe-photo-cam" aria-hidden="true">
                    <CameraIcon />
                  </span>
                )}
              </RecipePicture>
            }
          />
        </div>
        <div className="recipe-form-names">
          <label className="field">
            <span>
              Name <span className="recipe-req" aria-hidden="true">*</span>
            </span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pasta with tomato sauce" />
          </label>
          <label className="field">
            <span>Description (optional)</span>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add a short description…" />
          </label>
        </div>
      </div>
      {picker.error && (
        <p className="small recipe-ing-error" role="alert">
          {picker.error}
        </p>
      )}

      <div className="recipe-numbers">
        <label className="field">
          <span className="recipe-label">
            <ForkKnifeIcon /> Servings
          </span>
          <input type="number" inputMode="numeric" min={1} step={1} required value={servings} onChange={(e) => setServings(e.target.value)} />
        </label>
        <label className="field">
          <span className="recipe-label">
            <PencilIcon /> Prep (min)
          </span>
          <input type="number" inputMode="numeric" min={0} step={1} value={prep} onChange={(e) => setPrep(e.target.value)} placeholder="0" />
        </label>
        <label className="field">
          <span className="recipe-label">
            <PotIcon /> Cook (min)
          </span>
          <input type="number" inputMode="numeric" min={0} step={1} value={cook} onChange={(e) => setCook(e.target.value)} placeholder="0" />
        </label>
      </div>

      <div className="field">
        <label className="recipe-label" htmlFor="recipe-tags">
          <TagIcon /> Tags
        </label>
        <input id="recipe-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. dinner, quick, vegetarian" />
        {knownTags.some((t) => !typedTags.includes(t)) && (
          <div className="chips recipe-tag-chips">
            {knownTags
              .filter((t) => !typedTags.includes(t))
              .map((t) => (
                <button key={t} type="button" className="chip" onClick={() => addTag(t)} aria-label={`Add tag ${t}`}>
                  + {t}
                </button>
              ))}
          </div>
        )}
      </div>

      <section className="recipe-form-section" aria-labelledby="ing-head">
        <div className="recipe-section-head">
          <h2 id="ing-head" className="recipe-label">
            <PotIcon /> Ingredients
          </h2>
          <button type="button" className="icon-action recipe-add" aria-label="Add an ingredient" onClick={addIngredient}>
            <PlusIcon />
          </button>
        </div>
        <ul className="recipe-ing-edit">
          {ingredients.map((d, i) => {
            const invalid = showErrors && bad.includes(d.id);
            return (
              <li key={d.id}>
                <div className="recipe-ing-row">
                  <input
                    id={`ing-n-${d.id}`}
                    value={d.name}
                    onChange={(e) => setIngredient(d.id, { name: e.target.value, ...(d.productId ? { productId: null } : {}) })}
                    onFocus={() => setTyping(d.id)}
                    // Hidden a moment later, not at once: on iPhone the field loses focus before the tap on a
                    // suggestion arrives, and a list removed at once would swallow the tap.
                    onBlur={() => setTimeout(() => setTyping((t) => (t === d.id ? null : t)), 200)}
                    placeholder={i === 0 ? 'Add ingredient…' : 'Ingredient'}
                    aria-label={`Ingredient ${i + 1}`}
                    aria-describedby={`ing-link-${d.id}`}
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        document.getElementById(`ing-a-${d.id}`)?.focus();
                      }
                    }}
                  />
                  <input
                    id={`ing-a-${d.id}`}
                    value={d.amount}
                    onChange={(e) => setIngredient(d.id, { amount: e.target.value })}
                    placeholder="Amount"
                    aria-label={`Amount of ingredient ${i + 1}, like 250 g, 1/2 cup or to taste`}
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? `ing-err-${d.id}` : undefined}
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (i === ingredients.length - 1) addIngredient();
                        else document.getElementById(`ing-n-${ingredients[i + 1].id}`)?.focus();
                      }
                    }}
                  />
                </div>
                {typing === d.id && !d.productId && (() => {
                  const hits = suggestProducts(d.name.replace(/\(optional\)/i, ''), products);
                  return hits.length > 0 ? (
                    <ul className="menu recipe-suggest" aria-label="Products you have bought">
                      {hits.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="menu-item"
                            // Picked as soon as the finger touches it (Safari moves focus, and the keyboard
                            // closing shifts the page, before a click would arrive); Enter / Space still click.
                            onPointerDown={(e) => {
                              e.preventDefault();
                              pick(d, p);
                            }}
                            onClick={(e) => {
                              if (e.detail === 0) pick(d, p);
                            }}
                          >
                            <CartIcon /> {p.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null;
                })()}
                <IngredientLink draft={d} products={products} staples={kitchen?.staples} onUnlink={() => setIngredient(d.id, { productId: null })} />
                {invalid && (
                  <p id={`ing-err-${d.id}`} className="small recipe-ing-error" role="alert">
                    Can’t read this amount. Try 250 g, 1/2 cup, 2 tbsp, 3, a pinch or to taste.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <p className="muted small recipe-hint">Amounts like 250 g, ½ cup, 2 tbsp, 3, a pinch or to taste. Add “(optional)” after a name. Clear a name to remove it.</p>
      </section>

      <section className="recipe-form-section" aria-labelledby="steps-head">
        <div className="recipe-section-head">
          <h2 id="steps-head" className="recipe-label">
            <ListIcon /> Steps
          </h2>
          <button type="button" className="icon-action recipe-add" aria-label="Add a step" onClick={addStep}>
            <PlusIcon />
          </button>
        </div>
        <ol className={dragging ? 'recipe-step-edit is-sorting' : 'recipe-step-edit'} ref={stepList}>
          {steps.map((s, i) => (
            <li key={s.id} className={dragging === s.id ? 'is-dragging' : undefined}>
              <span className="recipe-step-no" aria-hidden="true">
                {i + 1}
              </span>
              <textarea id={`step-${s.id}`} rows={2} value={s.text} onChange={(e) => setStep(s.id, e.target.value)} placeholder="Describe this step…" aria-label={`Step ${i + 1}`} />
              {steps.length > 1 && (
                <button
                  type="button"
                  className="recipe-grip"
                  aria-label={`Move step ${i + 1}: drag, or use the up and down arrow keys`}
                  onPointerDown={(e) => startDrag(e, s.id)}
                  onPointerMove={moveDrag}
                  onPointerUp={() => setDragging(null)}
                  onPointerCancel={() => setDragging(null)}
                  onKeyDown={(e) => keyMove(e, i)}
                >
                  <GripIcon />
                </button>
              )}
            </li>
          ))}
        </ol>
        <p className="muted small recipe-hint">Drag a step by its handle to move it. Clear a step to remove it.</p>
      </section>
    </form>
  );
}

/** Under an ingredient: the product it is linked to (with Unlink), else the one its name matches, else nothing. */
function IngredientLink({ draft, products, staples, onUnlink }: { draft: IngredientDraft; products: Kitchen['products']; staples?: Set<string>; onUnlink(): void }) {
  const name = draft.name.replace(/\(optional\)\s*$/i, '').trim();
  const id = `ing-link-${draft.id}`;
  if (!name) return <span id={id} hidden />;
  if (staples?.has(stapleKey(name))) return <p id={id} className="muted small recipe-link">Always in your pantry</p>;
  const linked = draft.productId ? products.find((p) => p.id === draft.productId) : undefined;
  if (linked)
    return (
      <p id={id} className="small recipe-link recipe-linked">
        <CartIcon /> <span>Linked to {linked.name}</span>
        <button type="button" className="recipe-reset" onClick={onUnlink}>
          Unlink
        </button>
      </p>
    );
  const match = matchProduct(name, products);
  return match ? (
    <p id={id} className="muted small recipe-link">
      Matches {match.name} by name
    </p>
  ) : (
    <span id={id} hidden />
  );
}
