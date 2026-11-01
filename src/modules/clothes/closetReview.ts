import { addChip, removeChip, withColors } from './chips';
import { itemColors, PALETTE } from './colors';
import { CATEGORIES, SEASONS, SUBCATEGORIES, label, type Category, type ClothingItem, type Season } from './types';

export const REVIEW_STEPS = ['season', 'occasion', 'category', 'color', 'pattern', 'material', 'style', 'fit'] as const;
export type ReviewStep = (typeof REVIEW_STEPS)[number];

export interface StepInfo {
  id: ReviewStep;
  title: string;
  minutes: string;
  /** Pick one value (replaces) or any number (toggles). */
  single: boolean;
  options: string[];
}

export const OCCASIONS = ['Daily', 'Work', 'Date', 'Formal', 'Travel', 'Home', 'Party', 'Sport', 'Special', 'School', 'Beach', 'Etc'];
export const PATTERNS = ['Solid', 'Striped', 'Checked', 'Plaid', 'Polka dot', 'Floral', 'Graphic', 'Logo', 'Animal print', 'Camo', 'Tie-dye', 'Other'];
export const MATERIALS = ['Cotton', 'Linen', 'Wool', 'Denim', 'Leather', 'Silk', 'Polyester', 'Nylon', 'Viscose', 'Knit', 'Fleece', 'Elastane'];
export const STYLES = ['Casual', 'Streetwear', 'Classic', 'Sporty', 'Vintage', 'Minimalist', 'Preppy', 'Elegant', 'Boho', 'Edgy'];
export const FITS = ['Slim', 'Regular', 'Relaxed', 'Oversized', 'Cropped', 'Tight'];

export const STEPS: StepInfo[] = [
  { id: 'season', title: 'Season', minutes: '1-3 min', single: false, options: SEASONS.map(label) },
  { id: 'occasion', title: 'Occasion', minutes: '3-5 min', single: false, options: OCCASIONS },
  { id: 'category', title: 'Category', minutes: '3-5 min', single: true, options: CATEGORIES.map(label) },
  { id: 'color', title: 'Color', minutes: '1-3 min', single: false, options: PALETTE },
  { id: 'pattern', title: 'Pattern', minutes: '1-3 min', single: true, options: PATTERNS },
  { id: 'material', title: 'Material', minutes: '3-5 min', single: false, options: MATERIALS },
  { id: 'style', title: 'Style', minutes: '1-3 min', single: false, options: STYLES },
  { id: 'fit', title: 'Fit', minutes: '1-3 min', single: true, options: FITS },
];

export const stepInfo = (id: string): StepInfo | undefined => STEPS.find((s) => s.id === id);

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const materialList = (item: ClothingItem) =>
  (item.material ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

/** The item's current values for a step, as display labels (what the option chips are compared against). */
export function stepValues(item: ClothingItem, step: ReviewStep): string[] {
  switch (step) {
    case 'season':
      return item.seasons.map(label);
    case 'occasion':
      return item.occasions ?? [];
    case 'category':
      return [label(item.category)];
    case 'color':
      return itemColors(item);
    case 'pattern':
      return item.pattern ? [item.pattern] : [];
    case 'material':
      return materialList(item);
    case 'style':
      return item.styles ?? [];
    case 'fit':
      return item.fit ? [item.fit] : [];
  }
}

/** Toggles one option on an item for a step; single-choice steps replace the value (or clear it when re-picked). */
export function toggleStepValue(item: ClothingItem, step: ReviewStep, option: string): ClothingItem {
  const updatedAt = new Date().toISOString();
  const has = stepValues(item, step).some((v) => same(v, option));
  switch (step) {
    case 'season': {
      const s = option.toLowerCase() as Season;
      const seasons = has ? item.seasons.filter((x) => x !== s) : SEASONS.filter((x) => x === s || item.seasons.includes(x));
      return { ...item, seasons, updatedAt };
    }
    case 'occasion': {
      const cur = item.occasions ?? [];
      const occasions = has ? removeChip(cur, option) : addChip(cur, option);
      return { ...item, occasions: occasions.length ? occasions : undefined, updatedAt };
    }
    case 'category': {
      const category = option.toLowerCase() as Category;
      // A sub-category belongs to its category, so changing category drops it.
      return category === item.category ? item : { ...item, category, subcategory: undefined, updatedAt };
    }
    case 'color':
      return withColors(item, has ? removeChip(itemColors(item), option) : addChip(itemColors(item), option));
    case 'pattern':
      return { ...item, pattern: has ? undefined : option, updatedAt };
    case 'material': {
      const list = has ? removeChip(materialList(item), option) : addChip(materialList(item), option);
      return { ...item, material: list.length ? list.join(', ') : undefined, updatedAt };
    }
    case 'style': {
      const cur = item.styles ?? [];
      const styles = has ? removeChip(cur, option) : addChip(cur, option);
      return { ...item, styles: styles.length ? styles : undefined, updatedAt };
    }
    case 'fit':
      return { ...item, fit: has ? undefined : option, updatedAt };
  }
}

/** Selects every season, or clears them all when every season is already selected. */
export function toggleAllSeasons(item: ClothingItem): ClothingItem {
  const all = SEASONS.every((s) => item.seasons.includes(s));
  return { ...item, seasons: all ? [] : [...SEASONS], updatedAt: new Date().toISOString() };
}

/** Sets or clears (same value again) the sub-category, offered once a category is chosen. */
export function toggleSubcategory(item: ClothingItem, sub: string): ClothingItem {
  const subcategory = item.subcategory && same(item.subcategory, sub) ? undefined : sub;
  return { ...item, subcategory, updatedAt: new Date().toISOString() };
}

export const subcategoryOptions = (item: ClothingItem): string[] => SUBCATEGORIES[item.category] ?? [];

/** Items still in the closet; leaving items aren't worth reviewing. */
export const reviewable = (items: ClothingItem[]) => items.filter((i) => i.status === 'active' || i.status === 'storage');

export const isReviewed = (item: ClothingItem, step: ReviewStep) => Boolean(item.reviewed?.[step]);

/** Stamps the items as reviewed for a step (date is YYYY-MM-DD). */
export function markReviewed(item: ClothingItem, step: ReviewStep, date: string): ClothingItem {
  return { ...item, reviewed: { ...item.reviewed, [step]: date }, updatedAt: new Date().toISOString() };
}

export interface StepProgress {
  /** Latest review date across items, if any. */
  lastReviewed?: string;
  /** Reviewable items not yet reviewed for the step. */
  pending: number;
  total: number;
}

export function stepProgress(items: ClothingItem[], step: ReviewStep): StepProgress {
  const list = reviewable(items);
  let lastReviewed: string | undefined;
  let pending = 0;
  for (const i of list) {
    const d = i.reviewed?.[step];
    if (!d) pending++;
    else if (!lastReviewed || d > lastReviewed) lastReviewed = d;
  }
  return { lastReviewed, pending, total: list.length };
}

/** Items shown in a step: reviewable ones in the category tab, optionally only those new to the step. */
export function stepItems(items: ClothingItem[], step: ReviewStep, category: Category | 'all', onlyNew: boolean): ClothingItem[] {
  return reviewable(items)
    .filter((i) => category === 'all' || i.category === category)
    .filter((i) => !onlyNew || !isReviewed(i, step))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
