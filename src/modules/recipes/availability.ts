import { normalizeKey, type ProductSummary } from '../food/products';
import type { Stock } from '../food/stock';
import { formatQuantity } from './ingredients';
import type { RecipeIngredient, RecipeUnit } from './types';
import { stockToBase, toBase } from './units';

/** A product with what is left of it (the food module's stock entry). */
export interface StockedProduct {
  product: ProductSummary;
  stock: Stock;
}

/** Every word of the ingredient appears in the product's name, give or take a plural "s" ("tomatoes" ↔ "tomato"). */
function wordsMatch(ingredient: string[], product: string[]): boolean {
  const stem = (w: string) => w.replace(/(es|s)$/, '');
  return ingredient.every((w) => product.some((p) => p === w || stem(p) === stem(w) || (w.length >= 4 && p.startsWith(w))));
}

/** A product's normalised name, worked out once per product: ranking hundreds of recipes asks for it thousands of times. */
const nameKeys = new WeakMap<ProductSummary, string>();
const nameKey = (p: ProductSummary): string => {
  let k = nameKeys.get(p);
  if (k === undefined) nameKeys.set(p, (k = normalizeKey(p.name)));
  return k;
};

/**
 * The product an unlinked ingredient stands for, matched by name: the same name first, else a product whose name has
 * every word of the ingredient ("Tortellini" → "Tortellini sa sirom"), the one bought most recently. None when nothing
 * fits: a guess that is wrong would say you have something you don't.
 */
export function matchProduct(name: string, products: ProductSummary[]): ProductSummary | undefined {
  const key = normalizeKey(name);
  if (!key) return undefined;
  const exact = products.find((p) => nameKey(p) === key);
  if (exact) return exact;
  const words = key.split(' ');
  const newest = (p: ProductSummary) => p.purchases[0]?.date ?? '';
  return products
    .filter((p) => wordsMatch(words, nameKey(p).split(' ')))
    .sort((a, b) => newest(b).localeCompare(newest(a)) || a.name.length - b.name.length)[0];
}

/** Product suggestions while typing an ingredient: name matches first, then the most recently bought. */
export function suggestProducts(text: string, products: ProductSummary[], limit = 5): ProductSummary[] {
  const words = normalizeKey(text).split(' ').filter(Boolean);
  if (!words.length) return [];
  const score = (p: ProductSummary) => {
    const name = normalizeKey(p.name).split(' ');
    const printed = normalizeKey(p.purchases.map((x) => x.rawName ?? '').join(' '));
    let s = 0;
    for (const w of words) {
      if (name.some((n) => n.startsWith(w))) s += 2;
      else if (printed.includes(w)) s += 1;
      else return 0;
    }
    return s;
  };
  return products
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (b.p.purchases[0]?.date ?? '').localeCompare(a.p.purchases[0]?.date ?? ''))
    .slice(0, limit)
    .map((x) => x.p);
}

/** The key a pantry staple is remembered by: the ingredient's name, normalised, so "Salt" and "salt" are one. */
export const stapleKey = (name: string): string => normalizeKey(name);

export type IngredientState = 'available' | 'partial' | 'missing';

export interface IngredientCheck {
  ingredient: RecipeIngredient;
  state: IngredientState;
  /** The product it was checked against: linked, or matched by name (`matched`). */
  product?: ProductSummary;
  matched?: boolean;
  /** Always there (salt, oil…): never missing. */
  staple?: boolean;
  /** In stock, but the amounts can't be compared (e.g. 250 g against "1 pack"), so whether it is enough is unknown. */
  unverified?: boolean;
  /** What is still needed, in the ingredient's own unit (partial only). */
  more?: number;
}

/**
 * One ingredient against the stock. A staple is available. Otherwise the linked product (else one matched by name)
 * must have stock: weights and volumes are compared in grams and millilitres (cups and ounces converted), pieces with
 * pieces; when the units can't be compared, having any of it counts as available but unverified.
 */
export function checkIngredient(ingredient: RecipeIngredient, stocked: Map<string, StockedProduct>, products: ProductSummary[], staples: Set<string>): IngredientCheck {
  if (staples.has(stapleKey(ingredient.name))) return { ingredient, state: 'available', staple: true };
  const linked = ingredient.productId ? products.find((p) => p.id === ingredient.productId) : undefined;
  const product = linked ?? matchProduct(ingredient.name, products);
  const matched = !linked && !!product;
  if (!product) return { ingredient, state: 'missing' };
  const left = stocked.get(product.id)?.stock.quantity ?? 0;
  if (left <= 1e-9) return { ingredient, state: 'missing', product, matched };
  const need = toBase(ingredient.quantity, ingredient.unit);
  if (!need) return { ingredient, state: 'available', product, matched };
  const have = stockToBase(left, product.unit);
  if (have.family !== need.family) return { ingredient, state: 'available', product, matched, unverified: true };
  if (have.amount + 1e-9 >= need.amount) return { ingredient, state: 'available', product, matched };
  const perUnit = toBase(1, ingredient.unit)!.amount;
  return { ingredient, state: 'partial', product, matched, more: (need.amount - have.amount) / perUnit };
}

export interface RecipeCheck {
  items: IngredientCheck[];
  /** Ingredients that keep you from cooking it: missing or not enough, never optional ones. */
  lacking: IngredientCheck[];
  /** True when nothing is lacking. */
  canCook: boolean;
}

/** Every ingredient of a recipe against the stock; `ingredients` may be scaled to other servings first. */
export function checkRecipe(ingredients: RecipeIngredient[], stocked: Map<string, StockedProduct>, products: ProductSummary[], staples: Set<string>): RecipeCheck {
  const items = ingredients.map((i) => checkIngredient(i, stocked, products, staples));
  const lacking = items.filter((c) => c.state !== 'available' && !c.ingredient.optional);
  return { items, lacking, canCook: lacking.length === 0 };
}

/** The stock entries keyed by product id, for `checkIngredient`. */
export const stockMap = (entries: StockedProduct[]): Map<string, StockedProduct> => new Map(entries.map((e) => [e.product.id, e]));

/** What is still needed, rounded up to something you can measure: whole grams and pieces, quarter cups and spoons. */
export function roundUpNeed(more: number, unit: RecipeUnit): number {
  const up = (step: number) => Math.ceil(more / step - 1e-9) * step;
  if (unit === 'g' || unit === 'ml' || unit === 'piece' || unit === 'pinch') return up(1);
  if (unit === 'kg' || unit === 'l') return up(0.01);
  return up(0.25);
}

/** "200 g more", "1 cup more", "2 more" (pieces). */
export function moreText(more: number, unit: RecipeUnit): string {
  const q = formatQuantity(roundUpNeed(more, unit), unit);
  return unit === 'piece' ? `${q} more` : `${q} ${unit} more`;
}
