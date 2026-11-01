/** What a receipt line is. Deposits (bottle/can returns) and bags are not food and stay out of food stats. */
export const LINE_KINDS = ['food', 'alcohol', 'deposit', 'bag', 'other'] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export const KIND_LABELS: Record<LineKind, string> = {
  food: 'Food & drink',
  alcohol: 'Alcohol',
  deposit: 'Deposits',
  bag: 'Bags',
  other: 'Other',
};

/** How a line is measured: pieces, or weighed (kg) / poured (l). */
export const UNITS = ['pc', 'kg', 'l'] as const;
export type Unit = (typeof UNITS)[number];

/** One line of a grocery receipt. */
export interface ReceiptLine {
  /** Cleaned-up name, e.g. "Oat milk 3.5%". */
  name: string;
  /** The name as printed on the receipt, e.g. "NAP ZOB 3,5% MA NO M". */
  rawName?: string;
  kind: LineKind;
  /** Pieces, or kg/l for weighed lines. */
  quantity: number;
  unit: Unit;
  /** Price charged per unit, as printed on the receipt (a discount is already inside it). */
  unitPrice: number;
  /** What was saved on this line (POPUST, loyalty card), e.g. 0.67. Informational: already in `unitPrice`, never subtracted again. */
  discount: number;
  /** What was paid for the line: quantity × unitPrice. */
  paid: number;
}

/** A shop receipt. One record per receipt; id = `food-<sourceId>` so adding it twice changes nothing. */
export interface FoodReceipt {
  id: string;
  /** Chain, e.g. "Konzum". */
  store: string;
  /** Branch / address. */
  branch?: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time?: string;
  /** Total printed on the receipt, when given. */
  total?: number;
  lines: ReceiptLine[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** How a product is tracked in the inventory: fresh (goes off), staple (counted), drink (counted exactly), snack (assumed gone soon). */
export const PRODUCT_TYPES = ['fresh', 'staple', 'drink', 'snack'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  fresh: 'Fresh',
  staple: 'Staple',
  drink: 'Drink',
  snack: 'Snack',
};

export const STORAGES = ['fridge', 'pantry', 'freezer'] as const;
export type Storage = (typeof STORAGES)[number];

/**
 * What you or Claude know about a product beyond its receipts. The id comes from the cleaned name
 * (`productId()`), so the same product on different receipts is the same record. Created on demand;
 * a product without a record just uses defaults.
 */
export interface FoodProduct {
  id: string;
  /** Cleaned name, e.g. "Oat drink 3.5%". */
  name: string;
  type: ProductType;
  storage: Storage;
  /** Days it keeps once bought, for fresh items ("use soon"). */
  shelfLifeDays?: number;
  createdAt: string;
  updatedAt: string;
}

/** What happened to some of a product: eaten/used, thrown away, or counted ("I have 3 left", 0 = finished). */
export type StockEventType = 'use' | 'toss' | 'count';

/**
 * One thing that changed what you have. Always a fresh record, never edited (a mistake is fixed with a newer
 * count). Stock is worked out from purchases plus these, see `stockOf()`.
 */
export interface StockEvent {
  id: string;
  productId: string;
  type: StockEventType;
  /** Units used or thrown away, or the number counted, in the product's unit (pieces, kg or l). */
  quantity: number;
  /** YYYY-MM-DD */
  date: string;
  source: 'app' | 'check' | 'claude';
  note?: string;
  createdAt: string;
  updatedAt: string;
}
