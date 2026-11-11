import type { ProductSummary } from '../food/products';
import type { IngredientCheck } from './availability';
import { amountText, parseQuantity } from './ingredients';
import type { Recipe, RecipeIngredient } from './types';
import { toBase } from './units';

/** Why an ingredient is not taken off the stock when you finish cooking. */
export type NotTracked = 'staple' | 'unlinked' | 'none-left';

/** One ingredient on the "what did you use?" screen. */
export interface CookLine {
  ingredient: RecipeIngredient;
  /** The product its amount comes off; absent when it is not tracked. */
  product?: ProductSummary;
  /** Why nothing comes off. */
  notTracked?: NotTracked;
  /** What is left of the product, in its own unit (pieces, kg or l; single items for multipacks). */
  left: number;
  /** The suggested amount to take off, in the product's unit, never more than `left`. */
  amount: number;
  /**
   * How `amount` was found: `converted` from the recipe's amount (grams → kg, pieces → pieces), `guess` when the units
   * can't be compared (one pack for "250 g"), `unknown` when the recipe gives no amount ("to taste"): 0, you say.
   */
  basis: 'converted' | 'guess' | 'unknown';
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * The amount of a product that an ingredient stands for, in the product's unit: grams and millilitres become kg or l,
 * pieces stay pieces. Undefined when the two can't be compared.
 */
export function inProductUnit(ingredient: Pick<RecipeIngredient, 'quantity' | 'unit'>, product: Pick<ProductSummary, 'unit'>): number | undefined {
  const need = toBase(ingredient.quantity, ingredient.unit);
  if (!need) return undefined;
  if (product.unit === 'kg' && need.family === 'weight') return need.amount / 1000;
  if (product.unit === 'l' && need.family === 'volume') return need.amount / 1000;
  if (product.unit === 'pc' && need.family === 'count') return need.amount;
  return undefined;
}

/**
 * What to take off the stock for each ingredient (already scaled to the servings cooked), pre-filled from the recipe
 * and capped at what is there. Staples, ingredients without a product and products with nothing left are listed as
 * not tracked: nothing comes off for them.
 */
export function cookLines(checks: IngredientCheck[], leftOf: (productId: string) => number): CookLine[] {
  return checks.map((c): CookLine => {
    const { ingredient } = c;
    if (c.staple) return { ingredient, notTracked: 'staple', left: 0, amount: 0, basis: 'unknown' };
    if (!c.product) return { ingredient, notTracked: 'unlinked', left: 0, amount: 0, basis: 'unknown' };
    const left = Math.max(0, leftOf(c.product.id));
    if (left <= 1e-9) return { ingredient, product: c.product, notTracked: 'none-left', left: 0, amount: 0, basis: 'unknown' };
    const exact = inProductUnit(ingredient, c.product);
    if (exact !== undefined) return { ingredient, product: c.product, left, amount: round3(Math.min(exact, left)), basis: 'converted' };
    if (toBase(ingredient.quantity, ingredient.unit)) return { ingredient, product: c.product, left, amount: round3(Math.min(1, left)), basis: 'guess' };
    return { ingredient, product: c.product, left, amount: 0, basis: 'unknown' };
  });
}

/**
 * Where "What did you use?" starts: the pre-filled amounts, except that once you have ticked anything on the
 * "Get everything ready" checklist, what you left unticked starts at 0 (you didn't take it out, so you didn't use it).
 * Ticking nothing at all leaves every amount as pre-filled.
 */
export function startingAmounts(lines: CookLine[], ticked: Set<string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) out[l.ingredient.id] = ticked.size && !ticked.has(l.ingredient.id) ? 0 : l.amount;
  return out;
}

/** The uses to log once you confirm: one per tracked line with something to take off, never more than is there. */
export function usesToLog(lines: CookLine[], amounts: Record<string, number>): { productId: string; quantity: number }[] {
  const out: { productId: string; quantity: number }[] = [];
  for (const l of lines) {
    if (!l.product || l.notTracked) continue;
    const q = round3(Math.min(Math.max(0, amounts[l.ingredient.id] ?? l.amount), l.left));
    if (q > 0) out.push({ productId: l.product.id, quantity: q });
  }
  return out;
}

/** An amount typed on "What did you use?": like a recipe amount ("0.2", "½", "1 1/2"), but empty or 0 means none. NaN when unreadable. */
export function parseUsed(text: string): number {
  const t = text.trim().replace(',', '.');
  if (!t || /^0*\.?0*$/.test(t)) return 0;
  return parseQuantity(t) ?? 0;
}

/** The recipe with a day it was cooked added (kept in order, once per day). */
export function markCooked(recipe: Recipe, day: string, now: string): Recipe {
  const cooked = [...new Set([...(recipe.cooked ?? []), day])].sort();
  return { ...recipe, cooked, updatedAt: now };
}

/** The recipe's own amount, for "recipe: 250 g" next to a guess. */
export const recipeAmount = (i: RecipeIngredient): string => amountText(i);
