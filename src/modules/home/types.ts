/**
 * Home bills: one record per water or gas bill. Claude reads the bill (a photo, a PDF, an email or the old spreadsheet) and adds it with
 * the `add_utility_bills` tool; the app can then mark it paid or fix it by hand. id = `bill-<utility>-<sourceId>`.
 */
export type Utility = 'water' | 'gas';

/** Who paid the bill to the supplier. `other` = the person who took over the payments for a while: that money may have to be paid back. */
export type Payer = 'kevin' | 'felipe' | 'other';

/** One line of the bill's breakdown (supply, drainage, fixed fee, VAT…). */
export interface BillLine {
  label: string;
  amount: number;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
}

export interface UtilityBill {
  id: string;
  utility: Utility;
  /** Invoice number as printed, when there is one. */
  number?: string;
  /** The month the bill is for, YYYY-MM (the month its period ends). */
  month: string;
  periodStart?: string;
  periodEnd?: string;
  /** Due date; the app never shows it on the calendar, only on the bill. */
  due?: string;
  amount: number;
  /** Day the bill was paid; missing = still pending. */
  paidOn?: string;
  paidBy?: Payer;
  /** Water in m³, gas in Sm³, for the period the bill covers. */
  consumption?: number;
  /** Meter readings at the start and end of the period. */
  readingStart?: number;
  readingEnd?: number;
  /** True when the supplier estimated the reading instead of reading the meter. */
  estimated?: boolean;
  lines?: BillLine[];
  note?: string;
  createdAt: string;
  updatedAt: string;
}
