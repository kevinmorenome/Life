import type { Unit } from '../food/types';
import type { RecipeUnit } from './types';

/** What a unit measures. Amounts compare only within one family; `none` (pinch, to taste) never compares. */
export type UnitFamily = 'weight' | 'volume' | 'count' | 'none';

/** Grams or millilitres in one unit: metric is the base for every comparison. US customary measures. */
const TO_BASE: Partial<Record<RecipeUnit, { family: 'weight' | 'volume'; factor: number }>> = {
  g: { family: 'weight', factor: 1 },
  kg: { family: 'weight', factor: 1000 },
  oz: { family: 'weight', factor: 28.349523125 },
  ml: { family: 'volume', factor: 1 },
  l: { family: 'volume', factor: 1000 },
  'fl oz': { family: 'volume', factor: 29.5735295625 },
  cup: { family: 'volume', factor: 236.5882365 },
  tbsp: { family: 'volume', factor: 14.78676478125 },
  tsp: { family: 'volume', factor: 4.92892159375 },
};

export function unitFamily(unit: RecipeUnit): UnitFamily {
  const base = TO_BASE[unit];
  if (base) return base.family;
  return unit === 'piece' ? 'count' : 'none';
}

/**
 * An amount in its family's base: grams, millilitres or pieces. Null when it can't be measured
 * (pinch, to taste, or no quantity).
 */
export function toBase(quantity: number | undefined, unit: RecipeUnit): { family: 'weight' | 'volume' | 'count'; amount: number } | null {
  if (quantity === undefined || !Number.isFinite(quantity) || quantity < 0) return null;
  if (unit === 'piece') return { family: 'count', amount: quantity };
  const base = TO_BASE[unit];
  return base ? { family: base.family, amount: quantity * base.factor } : null;
}

/** A stock amount (food module units: pieces, kg, l) in the same base. */
export function stockToBase(quantity: number, unit: Unit): { family: 'weight' | 'volume' | 'count'; amount: number } {
  if (unit === 'kg') return { family: 'weight', amount: quantity * 1000 };
  if (unit === 'l') return { family: 'volume', amount: quantity * 1000 };
  return { family: 'count', amount: quantity };
}

/** Converts between two units of the same family; null across families or for unmeasurable units. */
export function convert(quantity: number, from: RecipeUnit, to: RecipeUnit): number | null {
  const a = toBase(quantity, from);
  const per = toBase(1, to);
  if (!a || !per || a.family !== per.family) return null;
  return a.amount / per.amount;
}
