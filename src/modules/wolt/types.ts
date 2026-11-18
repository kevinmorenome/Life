/**
 * One takeout delivery order (Wolt, Bolt Food or Uber Eats; `service`), read by Claude from the receipt email in Gmail (item lines are only in the
 * PDF attachment, so they are not tracked). id = `<service>-<sourceId>`; never edited from the tools.
 */
export type TakeoutService = 'wolt' | 'bolt' | 'uber';

export interface WoltOrder {
  id: string;
  /** Venue as Wolt names it, e.g. "McDonald's - Rotor". */
  restaurant: string;
  /** Local YYYY-MM-DD and HH:MM of the delivery. */
  date: string;
  time?: string;
  /** What was paid, in `currency`. */
  total: number;
  /** ISO code, "EUR" by default. Orders in other currencies stay out of the euro totals. */
  currency: string;
  city?: string;
  /** Which app the order came through; missing = wolt (older records). */
  service?: TakeoutService;
  createdAt: string;
  updatedAt: string;
}

/** One line of a takeout order, as printed on the restaurant's confirmation PDF (Croatian). Never edited. */
export interface TakeoutItem {
  /** Raw name exactly as printed (wrapped lines joined). */
  name: string;
  qty: number;
  /** Gross unit price, in the order's currency. */
  unitPrice: number;
  linePrice: number;
  /** VAT percent. */
  vat: number;
}

/**
 * What the PDFs add to an order: its item lines and the money around them. One record per order, id `td-<order id>`, written once
 * (the tools never edit records, so adding again changes nothing). The order itself stays as it was saved.
 */
export interface TakeoutDetail {
  id: string;
  /** The WoltOrder's id this belongs to. */
  orderId: string;
  items: TakeoutItem[];
  /** Sum of the item lines. The order total also holds delivery, service fee, tip…: the rest is "fees and other". */
  itemsSubtotal: number;
  /** Wolt's own fee invoice ("Račun …"), when there was one. */
  feesTotal?: number;
  invoiceNo?: string;
  paymentMethod?: string;
  /** "Dostava" = delivery. */
  orderType?: string;
  createdAt: string;
  updatedAt: string;
}

/** A like / dislike and note about a dish at a venue. Append-only: the newest one for a dish wins. */
export interface DishFeedback {
  id: string;
  /** `dishKey()` of the venue and raw dish name. */
  key: string;
  venue: string;
  dish: string;
  verdict?: 'liked' | 'disliked' | 'meh';
  note?: string;
  /** ISO timestamp. */
  at: string;
  createdAt: string;
  updatedAt: string;
}

/** Your own grouping of messy names ("Pohana piletina u slatko-kiselom umaku" and its variants → one dish). Edited in the app only. */
export interface DishGroup {
  id: string;
  key: string;
  venue: string;
  raw: string;
  group: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Which part of an order is yours (you may order for someone else). Append-only: the newest record for an order wins whole.
 * `mine` lists only the exceptions, by line number in the order's items: how many of that line were yours (0 = none).
 * A line not listed is all yours. What I eat counts only what is yours; the order's own total is unchanged.
 */
export interface OrderShare {
  id: string;
  orderId: string;
  mine: Record<string, number>;
  /** ISO timestamp. */
  at: string;
  createdAt: string;
  updatedAt: string;
}
