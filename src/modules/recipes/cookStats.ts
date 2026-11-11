import type { Recipe } from './types';

/** One time a recipe was cooked: a day from `Recipe.cooked`. */
export interface Cooked {
  date: string;
  recipe: Recipe;
}

const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** The stream of cooking: every day each recipe was cooked, newest first (same day: by recipe name). */
export function cookingStream(recipes: Recipe[]): Cooked[] {
  return recipes
    .flatMap((recipe) => [...new Set(recipe.cooked ?? [])].map((date) => ({ date, recipe })))
    .sort((a, b) => b.date.localeCompare(a.date) || a.recipe.name.localeCompare(b.recipe.name));
}

/** What was cooked each day, for the calendar and the day screen. */
export function cookedByDate(recipes: Recipe[]): Map<string, Recipe[]> {
  const out = new Map<string, Recipe[]>();
  for (const c of cookingStream(recipes)) out.set(c.date, [...(out.get(c.date) ?? []), c.recipe]);
  return out;
}

/**
 * Days in a row with something cooked. `current` counts back from today, or from yesterday when nothing was cooked
 * yet today (the streak isn't broken until the day is over); `longest` is the best run ever.
 */
export function cookingStreaks(days: string[], today: string): { current: number; longest: number } {
  const set = new Set(days);
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev = '';
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let current = 0;
  let day = set.has(today) ? today : addDays(today, -1);
  while (set.has(day)) {
    current += 1;
    day = addDays(day, -1);
  }
  return { current, longest };
}

export interface RecipeCount {
  recipe: Recipe;
  times: number;
  last: string;
}

/** Recipes by how often they were cooked (then most recently), only those cooked at least once. */
export function mostCooked(recipes: Recipe[]): RecipeCount[] {
  return recipes
    .map((recipe) => {
      const days = [...new Set(recipe.cooked ?? [])].sort();
      return { recipe, times: days.length, last: days[days.length - 1] ?? '' };
    })
    .filter((r) => r.times > 0)
    .sort((a, b) => b.times - a.times || b.last.localeCompare(a.last) || a.recipe.name.localeCompare(b.recipe.name));
}

/** Times cooked in each of the last `count` months, oldest first (`YYYY-MM`). */
export function cookedPerMonth(stream: Cooked[], today: string, count = 12): { month: string; times: number }[] {
  let [y, m] = today.slice(0, 7).split('-').map(Number);
  const months: string[] = [];
  for (let i = 0; i < count; i++) {
    months.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  const n = new Map<string, number>();
  for (const c of stream) n.set(c.date.slice(0, 7), (n.get(c.date.slice(0, 7)) ?? 0) + 1);
  return months.map((month) => ({ month, times: n.get(month) ?? 0 }));
}

/** Times cooked per weekday, Monday first. */
export function cookedPerWeekday(stream: Cooked[]): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const c of stream) out[(new Date(`${c.date}T12:00:00`).getDay() + 6) % 7] += 1;
  return out;
}

/** Recipes cooked before but not in the last `days` days, the longest ago first; and recipes never cooked, by name. */
export function forgotten(recipes: Recipe[], today: string, days = 30): { notLately: RecipeCount[]; never: Recipe[] } {
  const since = addDays(today, -days);
  const notLately = mostCooked(recipes)
    .filter((r) => r.last < since)
    .sort((a, b) => a.last.localeCompare(b.last));
  const never = recipes.filter((r) => !(r.cooked ?? []).length).sort((a, b) => a.name.localeCompare(b.name));
  return { notLately, never };
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", "5 months ago". */
export function agoText(date: string, today: string): string {
  const days = Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}
