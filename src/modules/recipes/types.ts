/**
 * Units an ingredient can be measured in. Metric (g, kg, ml, l) is the default and the base for every comparison;
 * US cups and ounces are converted to grams and millilitres (see `units.ts`).
 */
export const RECIPE_UNITS = ['g', 'kg', 'ml', 'l', 'oz', 'fl oz', 'cup', 'tsp', 'tbsp', 'piece', 'pinch', 'to taste'] as const;
export type RecipeUnit = (typeof RECIPE_UNITS)[number];

export const RECIPE_UNIT_LABELS: Record<RecipeUnit, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  oz: 'oz',
  'fl oz': 'fl oz',
  cup: 'cup',
  tsp: 'tsp',
  tbsp: 'tbsp',
  piece: 'piece',
  pinch: 'pinch',
  'to taste': 'to taste',
};

/**
 * Something to use instead of an ingredient, e.g. no cream → milk and butter. Either side is a free name, optionally
 * linked to a food product (`fp-…` id from `productId()` in the food module; there is no separate product list).
 */
export interface Substitution {
  id: string;
  /** What is replaced. On a recipe ingredient it is that ingredient, so these may be left empty there. */
  forName?: string;
  forProductId?: string;
  /** What to use instead. */
  useName: string;
  useProductId?: string;
  /** How it changes the dish, e.g. "a bit less rich". */
  note?: string;
}

/** A substitution that applies to every recipe: its own record in the `substitutions` store. */
export interface GlobalSubstitution extends Substitution {
  forName: string;
  createdAt: string;
  updatedAt: string;
}

/** One line of a recipe. Lives inside its `Recipe`, so deleting a recipe removes its ingredients and never touches stock. */
export interface RecipeIngredient {
  id: string;
  name: string;
  /** Absent for "to taste" and the like. */
  quantity?: number;
  unit: RecipeUnit;
  /** Never makes a recipe count as missing something. */
  optional?: boolean;
  notes?: string;
  /**
   * The food product this is, by its `fp-…` id. Null or absent = not linked; it is then matched by name.
   * A link is just an id: the product record (or the product itself, derived from receipts) is never changed by a recipe.
   */
  productId?: string | null;
  /** Substitutions for this ingredient in this recipe only. */
  substitutions?: Substitution[];
}

/** A dish of your own, in the `recipes` store (a photo store: the picture is split off locally, see `photoSplit.ts`). */
export interface Recipe {
  id: string;
  name: string;
  description?: string;
  ingredients: RecipeIngredient[];
  /** Instructions, in order. */
  steps: string[];
  /** How many the amounts are for. */
  servings: number;
  /** Minutes. */
  prepTime?: number;
  /** Minutes. */
  cookTime?: number;
  /** Small data URL (`resizeImage`); locally `hasPhoto` instead. */
  photo?: string;
  hasPhoto?: boolean;
  /** Free words, e.g. dinner, quick, vegetarian. */
  tags: string[];
  favorite?: boolean;
  /** Days it was cooked (YYYY-MM-DD), oldest first. */
  cooked?: string[];
  createdAt: string;
  updatedAt: string;
}
