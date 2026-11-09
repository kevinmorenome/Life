/**
 * What a receipt line is. Deposits (bottle/can returns) and bags are not food and stay out of food stats. Household & care
 * (shampoo, soap, toothpaste, cleaning products, from dm and the like) is stocked like food but is not food: it has its own
 * place in the stock grid and stays out of the food stats.
 */
export const LINE_KINDS = ['food', 'alcohol', 'household', 'deposit', 'bag', 'other'] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export const KIND_LABELS: Record<LineKind, string> = {
  food: 'Food & drink',
  alcohol: 'Alcohol',
  household: 'Household & care',
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

/** Where a product is kept; `home` is for what isn't food (the bathroom, the cleaning cupboard). */
export const STORAGES = ['fridge', 'pantry', 'freezer', 'home'] as const;
export type Storage = (typeof STORAGES)[number];

export const STORAGE_LABELS: Record<Storage, string> = { fridge: 'Fridge', pantry: 'Pantry', freezer: 'Freezer', home: 'Home' };

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
  /**
   * False for things you can't count or measure in a useful way (spices, salt, oil, sauces): you either have
   * it or it is out. A use is logged but doesn't lower anything; only "finished" (or a thrown away) does.
   * Absent means true.
   */
  trackAmount?: boolean;
  /**
   * Items in one pack as bought (a 6-pack of beer = 6), for products sold in pieces. Stock is then counted in
   * items (cans), so you can say "had one", not "used a sixth of a pack". Absent: a piece is what is bought.
   */
  packSize?: number;
  /** What one item is called, singular: "can", "bottle", "slice". */
  packLabel?: string;
  /** A picture of the product (small image data URL, background removed when possible); the drawn icon is used without one. */
  photo?: string;
  /** Same as `ClothingItem.hasPhoto`: the picture sits in the local photos store. */
  hasPhoto?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** What happened to some of a product: eaten/used, thrown away, counted ("I have 3 left", 0 = finished), a use-by date set for a batch, or some of it put in the freezer or taken out again. */
export type StockEventType = 'use' | 'toss' | 'count' | 'expiry' | 'freeze' | 'thaw';

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
  /**
   * The batch (purchase) this is about, `Purchase.batch`. A use or throw-away then comes off that batch; a count
   * sets that batch's amount; an `expiry` belongs to it; a `freeze` moves `quantity` of it into a new frozen batch (a `thaw` moves some of a
   * frozen one back out, use-by two days on). Without one, the stock that expires first is used.
   */
  batch?: string;
  /**
   * True to keep this out of the statistics (food thrown away, uses): it still changes the stock and shows in the
   * history, as a correction you made rather than something that happened today.
   */
  untracked?: boolean;
  /** For `expiry` events: the use-by date (YYYY-MM-DD) set for the batch. The newest one wins. */
  useBy?: string;
  note?: string;
  /**
   * Used up at some unknown time before (an old receipt, "I ate it, no idea when"). `date` is only when it was logged, to keep the
   * order of events right; the app shows "date unknown" and no stat reads it as a day something happened.
   */
  undated?: boolean;
  createdAt: string;
  updatedAt: string;
}
