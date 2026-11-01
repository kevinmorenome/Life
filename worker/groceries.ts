// Turns a grocery receipt that Claude read (PDF, photo or e-receipt email) into a FoodReceipt
// (see the `add_grocery_receipt` tool). The input is untrusted: every field is validated and
// anything off-schema is dropped or clamped.
import { linePaid, linesTotal, round2 } from '../src/modules/food/food';
import { LINE_KINDS, UNITS, type FoodReceipt, type LineKind, type ReceiptLine, type Unit } from '../src/modules/food/types';

const MAX_LINES = 120;
const MAX_MONEY = 100_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const str = (v: unknown, max = 200): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
};

const money = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_MONEY ? round2(v) : undefined;

export function isRealDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Lines without a name or a positive quantity are dropped. The amount paid is always recomputed from
 * quantity and the price per unit, so a mis-added figure can't make a line disagree with itself.
 */
export function parseGroceryLines(input: unknown): ReceiptLine[] {
  if (!Array.isArray(input)) return [];
  const out: ReceiptLine[] = [];
  for (const raw of input.slice(0, MAX_LINES)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const name = str(r.name);
    const unitPrice = money(r.unitPrice);
    const quantity = typeof r.quantity === 'number' && Number.isFinite(r.quantity) && r.quantity > 0 && r.quantity <= 10_000 ? Math.round(r.quantity * 1000) / 1000 : undefined;
    if (!name || unitPrice === undefined || quantity === undefined) continue;
    const discount = money(r.discount) ?? 0;
    out.push({
      name,
      rawName: str(r.rawName),
      kind: (LINE_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as LineKind) : 'food',
      quantity,
      unit: (UNITS as readonly string[]).includes(r.unit as string) ? (r.unit as Unit) : 'pc',
      unitPrice,
      discount,
      paid: linePaid(quantity, unitPrice),
    });
  }
  return out;
}

export interface ParsedReceipt {
  receipt: Omit<FoodReceipt, 'id' | 'createdAt' | 'updatedAt'>;
  /** Set when the printed total and the sum of the lines disagree by more than a few cents (a line was probably misread or missed). */
  mismatch?: { printed: number; summed: number };
}

export function parseGroceryReceipt(args: Record<string, unknown>, fallbackDate: string): ParsedReceipt | undefined {
  const store = str(args.store, 100);
  const lines = parseGroceryLines(args.lines);
  if (!store || lines.length === 0) return undefined;
  const total = money(args.total);
  const summed = linesTotal(lines);
  return {
    receipt: {
      store,
      branch: str(args.branch, 200),
      date: isRealDate(args.date) ? args.date : fallbackDate,
      time: typeof args.time === 'string' && TIME.test(args.time) ? args.time : undefined,
      total,
      lines,
      notes: str(args.notes, 1000),
    },
    mismatch: total !== undefined && Math.abs(total - summed) > 0.05 ? { printed: total, summed } : undefined,
  };
}
