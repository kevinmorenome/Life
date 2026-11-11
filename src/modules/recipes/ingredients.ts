import type { RecipeIngredient, RecipeUnit } from './types';

/** Units that have no amount to scale or compare: you add them as you like. */
const UNMEASURED: RecipeUnit[] = ['pinch', 'to taste'];
export const isMeasured = (unit: RecipeUnit): boolean => !UNMEASURED.includes(unit);

const GLYPHS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

/**
 * An amount as typed: "200", "0,5", "1/2", "1 1/2", "½", "1½". Empty → undefined; anything else that isn't a
 * positive number → NaN, so the form can say it can't read it.
 */
export function parseQuantity(text: string): number | undefined {
  let t = text.trim().replace(',', '.');
  if (!t) return undefined;
  let glyph = 0;
  for (const [g, v] of Object.entries(GLYPHS)) {
    if (t.endsWith(g)) {
      glyph = v;
      t = t.slice(0, -g.length).trim();
      break;
    }
  }
  let n: number;
  if (!t) n = 0;
  else if (/^\d+(\.\d+)?$/.test(t)) n = Number(t);
  else {
    const m = /^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/.exec(t);
    if (!m || Number(m[3]) === 0) return Number.NaN;
    n = Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]);
  }
  if (glyph && !/^\d*$/.test(t)) return Number.NaN;
  const total = n + glyph;
  return total > 0 ? total : Number.NaN;
}

const FRACTIONS: [number, string][] = [
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
];

/**
 * An amount for reading. Grams and millilitres are whole numbers from 10 up (one decimal below); kilos and litres
 * keep up to two decimals; spoons, cups, ounces and pieces show kitchen fractions (1½ cup, ⅓ tsp) when close to one,
 * else up to two decimals.
 */
export function formatQuantity(n: number, unit: RecipeUnit): string {
  if (!Number.isFinite(n)) return '';
  const trim = (x: number, digits: number) => String(Number(x.toFixed(digits)));
  if (unit === 'g' || unit === 'ml') return n >= 10 ? String(Math.round(n)) : trim(n, 1);
  if (unit === 'kg' || unit === 'l') return trim(n, 2);
  const whole = Math.floor(n + 1e-9);
  const rest = n - whole;
  if (rest < 0.02) return String(whole);
  if (rest > 0.98) return String(whole + 1);
  const frac = FRACTIONS.find(([v]) => Math.abs(rest - v) < 0.02);
  if (frac) return `${whole || ''}${frac[1]}`;
  return trim(n, 2);
}

/** "200 g", "1½ cup", "2" (pieces), "to taste", "a pinch" / "2 pinches"; empty when there is nothing to say. */
export function ingredientAmount(i: Pick<RecipeIngredient, 'quantity' | 'unit'>): string {
  if (i.unit === 'to taste') return 'to taste';
  if (i.unit === 'pinch') return !i.quantity || i.quantity === 1 ? 'a pinch' : `${formatQuantity(i.quantity, 'pinch')} pinches`;
  if (i.quantity === undefined) return i.unit === 'piece' ? '' : i.unit;
  const q = formatQuantity(i.quantity, i.unit);
  return i.unit === 'piece' ? q : `${q} ${i.unit}`;
}

/**
 * The ingredients for another number of servings: every measured amount times `to / from`. Pinches and "to taste"
 * stay as they are. Only for showing: the stored recipe never changes.
 */
export function scaleIngredients(ingredients: RecipeIngredient[], from: number, to: number): RecipeIngredient[] {
  if (!(from > 0) || !(to > 0) || from === to) return ingredients;
  const f = to / from;
  return ingredients.map((i) => (i.quantity !== undefined && isMeasured(i.unit) ? { ...i, quantity: i.quantity * f } : i));
}

/** An ingredient row as the form holds it: the amount as typed. */
export interface IngredientDraft {
  id: string;
  name: string;
  quantity: string;
  unit: RecipeUnit;
  optional: boolean;
  notes: string;
  /** What the form doesn't show (product link, substitutions) rides along unchanged. */
  base?: RecipeIngredient;
}

export const toDraft = (i: RecipeIngredient): IngredientDraft => ({
  id: i.id,
  name: i.name,
  quantity: i.quantity === undefined ? '' : formatQuantity(i.quantity, i.unit === 'g' || i.unit === 'ml' ? 'kg' : i.unit),
  unit: i.unit,
  optional: Boolean(i.optional),
  notes: i.notes ?? '',
  base: i,
});

/** The rows that can't be saved: an amount that isn't a positive number. Rows without a name are simply dropped. */
export function badQuantities(drafts: IngredientDraft[]): string[] {
  return drafts.filter((d) => d.name.trim() && Number.isNaN(parseQuantity(d.quantity))).map((d) => d.id);
}

/** Form rows back to ingredients: unnamed rows dropped, amounts read, no amount for pinch / to taste, fields kept. */
export function fromDrafts(drafts: IngredientDraft[]): RecipeIngredient[] {
  const out: RecipeIngredient[] = [];
  for (const d of drafts) {
    const name = d.name.trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const q = parseQuantity(d.quantity);
    const { quantity: _q, optional: _o, notes: _n, ...kept } = d.base ?? ({} as Partial<RecipeIngredient>);
    const ing: RecipeIngredient = { ...kept, id: d.id, name, unit: d.unit };
    if (q !== undefined && !Number.isNaN(q) && d.unit !== 'to taste') ing.quantity = q;
    if (d.optional) ing.optional = true;
    if (d.notes.trim()) ing.notes = d.notes.trim();
    out.push(ing);
  }
  return out;
}
