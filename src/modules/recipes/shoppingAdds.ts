import { addId } from '../food/shopping';
import type { ShoppingAdd, ShoppingNote } from '../food/types';
import { moreText, type IngredientCheck } from './availability';
import { ingredientAmount } from './ingredients';
import type { Recipe } from './types';

/** What to buy for one lacking ingredient, as text: the part that is missing, or the whole amount when none is there. */
function amountOf(c: IngredientCheck): string | undefined {
  const text = c.state === 'partial' ? moreText(c.more ?? 0, c.ingredient.unit) : ingredientAmount(c.ingredient);
  return text || undefined;
}

export interface AddPlan {
  /** Entries to write: new ones, and existing ones whose notes changed. */
  save: ShoppingAdd[];
  /** How many lacking ingredients went on the list that weren't there for this recipe. */
  added: number;
  /** How many were already on it exactly as they would be written. */
  already: number;
}

/**
 * The shopping-list entries for what a recipe lacks. One entry per product (or per name when the ingredient has no
 * product), so adding twice, or adding two recipes that both need the same thing, never repeats a line: the entry just
 * gets one note per recipe, and a recipe's own note is replaced, not appended. Nothing to save when it is all there.
 */
export function planAdds(recipe: Pick<Recipe, 'id' | 'name'>, lacking: IngredientCheck[], existing: ShoppingAdd[], today: string, now: string): AddPlan {
  const byId = new Map(existing.map((a) => [a.id, a]));
  const save = new Map<string, ShoppingAdd>();
  let added = 0;
  let already = 0;
  for (const c of lacking) {
    const productId = c.product?.id;
    const name = c.product?.name ?? c.ingredient.name;
    const id = addId(name, productId);
    const note: ShoppingNote = { forId: recipe.id, forName: recipe.name, ...(amountOf(c) ? { amount: amountOf(c) } : {}) };
    const base = save.get(id) ?? byId.get(id);
    const prior = base?.notes.find((n) => n.forId === recipe.id);
    if (prior && prior.amount === note.amount) {
      already++;
      continue;
    }
    added++;
    const notes = base ? [...base.notes.filter((n) => n.forId !== recipe.id), note] : [note];
    save.set(id, base ? { ...base, notes, updatedAt: now } : { id, name, ...(productId ? { productId } : {}), notes, addedOn: today, createdAt: now, updatedAt: now });
  }
  return { save: [...save.values()], added, already };
}
