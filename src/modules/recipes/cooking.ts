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

const UNIT_SECONDS: [RegExp, number][] = [
  [/^(h|hr|hrs|hour|hours|sat|sata|sati|hora|horas|stunde|stunden)$/, 3600],
  [/^(m|min|mins|minute|minutes|minuta|minute|minutos|minuten)$/, 60],
  [/^(s|sec|secs|second|seconds|sekundi|segundos|sekunden)$/, 1],
];

/** A timer a step offers: "10 minutes" → 600 s. For a range ("8-10 min") it is the longer end, so nothing comes out raw. */
export interface StepTimer {
  seconds: number;
  /** As written, for the button: "10 minutes". */
  label: string;
}

/** The durations a step mentions ("Boil for 10 minutes", "bake 1 hour", "rest 30 sec", "8–10 min"), each once, in order. */
export function stepTimers(text: string): StepTimer[] {
  const out: StepTimer[] = [];
  const re = /(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|to|or)\s*(\d+(?:[.,]\d+)?))?\s*([a-zA-Z]+)\b/g;
  for (const m of text.matchAll(re)) {
    const unit = UNIT_SECONDS.find(([r]) => r.test(m[3].toLowerCase()));
    if (!unit) continue;
    const n = Number((m[2] ?? m[1]).replace(',', '.'));
    const seconds = Math.round(n * unit[1]);
    if (seconds <= 0 || seconds > 24 * 3600 || out.some((t) => t.seconds === seconds)) continue;
    out.push({ seconds, label: m[0].trim() });
  }
  return out;
}

/** "9:05", "1:02:00": what a running timer shows. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Words of a name, lower case without accents, with a plural "s"/"es" dropped, for matching a step's text. */
const stems = (s: string): string[] =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)
    .map((w) => w.replace(/(es|s)$/, ''));

/** The ingredients a step mentions by name (any word of the name, whole words only, so "oil" is not found in "boil"). */
export function stepIngredients<T extends Pick<RecipeIngredient, 'name'>>(text: string, ingredients: T[]): T[] {
  const words = new Set(stems(text));
  return ingredients.filter((i) => stems(i.name).some((w) => words.has(w)));
}

/**
 * A step shown as a title and a description, like a recipe card: its first sentence is the title when more follows
 * and it is short enough to read at a glance (≤ 70 characters); otherwise the whole step is the title.
 */
export function splitStep(text: string): { title: string; rest?: string } {
  const t = text.trim();
  // A new sentence starts with a capital letter, so "2 tbsp. of oil" is not split at the abbreviation.
  const m = /^(.+?[.!?])\s+(\p{Lu}[\s\S]*)$/u.exec(t);
  if (!m || m[1].length > 70) return { title: t };
  return { title: m[1].replace(/\.$/, ''), rest: m[2] };
}
