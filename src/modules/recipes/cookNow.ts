import { daysBetween } from '../food/stock';
import { SOON_DAYS } from '../food/batchView';
import { checkRecipe, type IngredientCheck, type StockedProduct } from './availability';
import { totalMinutes } from './recipes';
import type { Recipe } from './types';
import type { ProductSummary } from '../food/products';

/** Up to this many lacking ingredients and a recipe is "almost there". */
export const ALMOST_MAX = 2;

export type CookGroup = 'now' | 'almost' | 'rest';

export const GROUP_LABELS: Record<CookGroup, string> = { now: 'Can cook now', almost: 'Almost there', rest: 'Missing more' };

/** One recipe against the stock. */
export interface CookCandidate {
  recipe: Recipe;
  group: CookGroup;
  /** What keeps you from cooking it (never optional ingredients). */
  lacking: IngredientCheck[];
  /** In-stock ingredients that should be used up soon, soonest first: what lifts the recipe in the ranking. */
  useSoon: { name: string; days: number }[];
}

export interface CookNowFilter {
  /** Any of these tags (none = every recipe). */
  tags: string[];
  /** Longest prep + cook time in minutes. A recipe with no times given is never left out for it. */
  maxMinutes?: number;
}

export const NO_COOK_FILTER: CookNowFilter = { tags: [] };

/** Choices for the time filter, in minutes. */
export const TIME_LIMITS = [15, 30, 45, 60] as const;

export const cookFilterCount = (f: CookNowFilter): number => f.tags.length + (f.maxMinutes ? 1 : 0);

function groupOf(lacking: number): CookGroup {
  return lacking === 0 ? 'now' : lacking <= ALMOST_MAX ? 'almost' : 'rest';
}

/**
 * Ingredients you have that are close to their use-by date (today up to `SOON_DAYS` away). The date is a soft hint:
 * estimated, often absent, so a product with none counts for nothing, and past dates (food that may be gone) are ignored.
 */
function useSoon(items: IngredientCheck[], stocked: Map<string, StockedProduct>, today: string): { name: string; days: number }[] {
  const out: { name: string; days: number }[] = [];
  for (const c of items) {
    if (c.staple || c.state === 'missing' || !c.product) continue;
    const by = stocked.get(c.product.id)?.stock.useBy;
    if (!by) continue;
    const days = daysBetween(today, by);
    if (days >= 0 && days <= SOON_DAYS) out.push({ name: c.product.name, days });
  }
  return out.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

/**
 * Every recipe that passes the filter, checked against the stock and grouped: can cook now, almost there (1–2
 * lacking), the rest. Within a group, recipes that use up food about to expire come first (the more of it and the
 * sooner, the higher), then favourites, then the fewest lacking, then by name. A missing use-by date never lowers a
 * recipe or leaves it out. Pure and linear in the ingredients, so hundreds of recipes stay quick.
 */
export function rankRecipes(
  recipes: Recipe[],
  stocked: Map<string, StockedProduct>,
  products: ProductSummary[],
  staples: Set<string>,
  today: string,
  filter: CookNowFilter = NO_COOK_FILTER,
): CookCandidate[] {
  const out: CookCandidate[] = [];
  for (const recipe of recipes) {
    if (filter.tags.length && !filter.tags.some((t) => recipe.tags.includes(t))) continue;
    const minutes = totalMinutes(recipe);
    if (filter.maxMinutes && minutes > 0 && minutes > filter.maxMinutes) continue;
    if (recipe.ingredients.length === 0) continue;
    const check = checkRecipe(recipe.ingredients, stocked, products, staples);
    out.push({ recipe, group: groupOf(check.lacking.length), lacking: check.lacking, useSoon: useSoon(check.items, stocked, today) });
  }
  // Soonest-expiring food counts most: one item due today beats several due in three days.
  const urgency = (c: CookCandidate) => c.useSoon.reduce((n, u) => n + (SOON_DAYS + 1 - u.days), 0);
  const order: Record<CookGroup, number> = { now: 0, almost: 1, rest: 2 };
  return out.sort(
    (a, b) =>
      order[a.group] - order[b.group] ||
      urgency(b) - urgency(a) ||
      Number(!!b.recipe.favorite) - Number(!!a.recipe.favorite) ||
      a.lacking.length - b.lacking.length ||
      a.recipe.name.localeCompare(b.recipe.name, undefined, { sensitivity: 'base' }),
  );
}

/** "You are only lacking X and Y." / "Lacking X, Y and 2 more." Empty when nothing is lacking. */
export function lackingText(lacking: IngredientCheck[]): string {
  const names = lacking.map((c) => c.ingredient.name);
  if (names.length === 0) return '';
  const list = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.length === 2 ? `${names[0]} and ${names[1]}` : names.join(', ');
  return names.length <= ALMOST_MAX ? `You are only lacking ${list}` : `Lacking ${list}`;
}

/** "Uses tomatoes (today) and milk (tomorrow)", from the use-soon list; empty when there is none. */
export function useSoonText(soon: { name: string; days: number }[]): string {
  if (!soon.length) return '';
  const when = (d: number) => (d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);
  const parts = soon.slice(0, 3).map((u) => `${u.name} (${when(u.days)})`);
  return `Uses up ${parts.length === 2 ? parts.join(' and ') : parts.join(', ')}`;
}

