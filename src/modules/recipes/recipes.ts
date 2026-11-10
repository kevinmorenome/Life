import type { Recipe } from './types';

/** Tags typed as free text, separated by commas: trimmed, lower-case, without empties or repeats. */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const tag = raw.trim().replace(/\s+/g, ' ').toLowerCase();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/** Steps as typed: each trimmed, empty ones dropped. */
export function cleanSteps(steps: string[]): string[] {
  return steps.map((s) => s.trim()).filter(Boolean);
}

/** Moves the item at `index` one place up (-1) or down (+1); out of range changes nothing. */
export function moveItem<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** "45 min", "1 h", "1 h 30 min"; empty for no time. */
export function formatMinutes(min: number | undefined): string {
  if (!min || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Prep plus cook time, in minutes (0 when neither is set). */
export const totalMinutes = (r: Pick<Recipe, 'prepTime' | 'cookTime'>): number => (r.prepTime ?? 0) + (r.cookTime ?? 0);

/**
 * A copy to make a variation: a new id, "(copy)" on the name, fresh timestamps, the same ingredients (with new ids)
 * and photo, and no cooking history or favourite mark.
 */
export function duplicateRecipe(r: Recipe, newId: () => string, now: string): Recipe {
  const { cooked: _cooked, favorite: _favorite, ...rest } = r;
  return {
    ...rest,
    id: newId(),
    name: `${r.name} (copy)`,
    ingredients: r.ingredients.map((i) => ({ ...i, id: newId(), substitutions: i.substitutions?.map((s) => ({ ...s, id: newId() })) })),
    steps: [...r.steps],
    tags: [...r.tags],
    createdAt: now,
    updatedAt: now,
  };
}

/** The list order: by name, ignoring case and accents. */
export function sortRecipes(recipes: Recipe[]): Recipe[] {
  return [...recipes].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.createdAt.localeCompare(b.createdAt));
}
