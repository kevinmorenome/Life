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
  /** Shelf price per unit, before the discount. */
  unitPrice: number;
  /** Discount on this line (positive number), e.g. 0.67. */
  discount: number;
  /** What was actually paid for the line: quantity × unitPrice − discount. */
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
