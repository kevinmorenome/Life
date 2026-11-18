// Turns the water and gas bills Claude read (a photo, a PDF, an email, the old spreadsheet) into UtilityBills (see the `add_utility_bills` tool).
// The input is untrusted: every field is validated and anything off-schema is dropped.
import { round2 } from '../src/modules/home/bills';
import type { BillLine, Payer, Utility, UtilityBill } from '../src/modules/home/types';
import { isRealDate } from './groceries';

const MAX_BILLS = 100;
const MAX_AMOUNT = 50_000;
const MAX_READING = 10_000_000;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const str = (v: unknown, max = 200): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
};
const num = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined);
const date = (v: unknown): string | undefined => (isRealDate(v) ? v : undefined);

export interface ParsedBills {
  bills: Omit<UtilityBill, 'createdAt' | 'updatedAt'>[];
  rejected: string[];
}

function parseLines(v: unknown): BillLine[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const lines: BillLine[] = [];
  for (const raw of v.slice(0, 40)) {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const label = str(r.label, 100);
    const amount = num(r.amount, -MAX_AMOUNT, MAX_AMOUNT);
    if (!label || amount === undefined) continue;
    const quantity = num(r.quantity, 0, MAX_READING);
    const unitPrice = num(r.unitPrice, 0, MAX_AMOUNT);
    lines.push({ label, amount: round2(amount), ...(quantity !== undefined ? { quantity } : {}), ...(str(r.unit, 12) ? { unit: str(r.unit, 12) } : {}), ...(unitPrice !== undefined ? { unitPrice } : {}) });
  }
  return lines.length ? lines : undefined;
}

export function parseUtilityBills(input: unknown): ParsedBills {
  const out: ParsedBills = { bills: [], rejected: [] };
  if (!Array.isArray(input)) return out;
  const seen = new Set<string>();
  for (const [i, raw] of input.slice(0, MAX_BILLS).entries()) {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const utility: Utility | undefined = r.utility === 'water' || r.utility === 'gas' ? r.utility : undefined;
    const sourceId = str(r.sourceId, 80)?.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    const periodEnd = date(r.periodEnd);
    const month = typeof r.month === 'string' && MONTH.test(r.month) ? r.month : periodEnd?.slice(0, 7);
    const amount = num(r.amount, 0, MAX_AMOUNT);
    if (!utility || !sourceId || !month || amount === undefined) {
      out.rejected.push(`#${i + 1}: needs utility (water or gas), sourceId, a month (YYYY-MM) and the amount`);
      continue;
    }
    const id = `bill-${utility}-${sourceId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const paidOn = date(r.paidOn);
    const paidBy: Payer | undefined = r.paidBy === 'kevin' || r.paidBy === 'felipe' || r.paidBy === 'other' ? r.paidBy : undefined;
    const consumption = num(r.consumption, 0, MAX_READING);
    const readingStart = num(r.readingStart, 0, MAX_READING);
    const readingEnd = num(r.readingEnd, 0, MAX_READING);
    const lines = parseLines(r.lines);
    const bill: Omit<UtilityBill, 'createdAt' | 'updatedAt'> = {
      id,
      utility,
      month,
      amount: round2(amount),
      ...(str(r.number, 40) ? { number: str(r.number, 40) } : {}),
      ...(date(r.periodStart) ? { periodStart: date(r.periodStart) } : {}),
      ...(periodEnd ? { periodEnd } : {}),
      ...(date(r.due) ? { due: date(r.due) } : {}),
      ...(paidOn ? { paidOn, ...(paidBy ? { paidBy } : {}) } : {}),
      ...(consumption !== undefined ? { consumption } : {}),
      ...(readingStart !== undefined ? { readingStart } : {}),
      ...(readingEnd !== undefined ? { readingEnd } : {}),
      ...(r.estimated === true ? { estimated: true } : {}),
      ...(lines ? { lines } : {}),
      ...(str(r.note, 400) ? { note: str(r.note, 400) } : {}),
    };
    out.bills.push(bill);
  }
  return out;
}
