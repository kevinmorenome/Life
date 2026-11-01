import { LINE_KINDS, type FoodReceipt, type LineKind, type ReceiptLine } from './types';

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Price paid for a line: quantity × shelf price − discount (never below 0). */
export function linePaid(quantity: number, unitPrice: number, discount: number): number {
  return Math.max(0, round2(quantity * unitPrice - discount));
}

/** Sum of what every line cost. */
export function linesTotal(lines: ReceiptLine[]): number {
  return round2(lines.reduce((sum, l) => sum + l.paid, 0));
}

/** Receipt total: the printed one when there is one, otherwise the sum of the lines. */
export function receiptTotal(r: Pick<FoodReceipt, 'total' | 'lines'>): number {
  return r.total ?? linesTotal(r.lines);
}

/** Spend per line kind for one receipt (kinds without lines are left out). */
export function spendByKind(lines: ReceiptLine[]): Partial<Record<LineKind, number>> {
  const out: Partial<Record<LineKind, number>> = {};
  for (const l of lines) out[l.kind] = round2((out[l.kind] ?? 0) + l.paid);
  return out;
}

/** Total discounts on a receipt. */
export function totalSaved(lines: ReceiptLine[]): number {
  return round2(lines.reduce((sum, l) => sum + l.discount, 0));
}

/** Spend per month (YYYY-MM) across receipts, newest first, split by kind. */
export function monthlySpend(receipts: FoodReceipt[]): { month: string; total: number; byKind: Partial<Record<LineKind, number>> }[] {
  const months = new Map<string, { total: number; byKind: Partial<Record<LineKind, number>> }>();
  for (const r of receipts) {
    const key = r.date.slice(0, 7);
    const m = months.get(key) ?? { total: 0, byKind: {} };
    for (const l of r.lines) {
      m.total = round2(m.total + l.paid);
      m.byKind[l.kind] = round2((m.byKind[l.kind] ?? 0) + l.paid);
    }
    months.set(key, m);
  }
  return [...months.entries()].map(([month, v]) => ({ month, ...v })).sort((a, b) => b.month.localeCompare(a.month));
}

/** Newest first. */
export function sortReceipts(receipts: FoodReceipt[]): FoodReceipt[] {
  return [...receipts].sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? '') || b.createdAt.localeCompare(a.createdAt));
}

/** Lines grouped in display order (food first), keeping receipt order inside each kind. */
export function groupLines(lines: ReceiptLine[]): { kind: LineKind; lines: ReceiptLine[] }[] {
  return LINE_KINDS.map((kind) => ({ kind, lines: lines.filter((l) => l.kind === kind) })).filter((g) => g.lines.length > 0);
}
