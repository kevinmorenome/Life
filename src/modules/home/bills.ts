// Pure logic for the Home module: sorting, who pays what share, spend and consumption series. Tested in bills.test.ts.
import type { Payer, Utility, UtilityBill } from './types';

export const UTILITIES: Utility[] = ['water', 'gas'];
export const UTILITY_NAMES: Record<Utility, string> = { water: 'Water', gas: 'Gas' };
export const UNITS: Record<Utility, string> = { water: 'm³', gas: 'Sm³' };
export const PAYER_NAMES: Record<Payer, string> = { kevin: 'Kevin', felipe: 'Felipe', other: 'The other person' };

/** From this month on the bills are Kevin's alone; before it they are split in half with Felipe. */
export const SOLE_FROM = '2027-01';

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const isPaid = (b: UtilityBill) => !!b.paidOn;

/** Kevin's part of a bill: half until `soleFrom`, all of it after. */
export function kevinShare(b: UtilityBill, soleFrom = SOLE_FROM): number {
  return round2(b.month >= soleFrom ? b.amount : b.amount / 2);
}

/** Newest month first, then the later invoice first. */
export function newestFirst(bills: UtilityBill[]): UtilityBill[] {
  return [...bills].sort((a, b) => b.month.localeCompare(a.month) || (b.paidOn ?? '').localeCompare(a.paidOn ?? '') || b.id.localeCompare(a.id));
}

export function pendingBills(bills: UtilityBill[]): UtilityBill[] {
  return newestFirst(bills.filter((b) => !isPaid(b)));
}

/** Bills by the day they were paid (not the due date), for the day screen. */
export function byPaidDate(bills: UtilityBill[]): Map<string, UtilityBill[]> {
  const map = new Map<string, UtilityBill[]>();
  for (const b of bills) {
    if (!b.paidOn) continue;
    map.set(b.paidOn, [...(map.get(b.paidOn) ?? []), b]);
  }
  return map;
}

export function searchBills(bills: UtilityBill[], query: string): UtilityBill[] {
  const q = query.trim().toLowerCase();
  if (!q) return bills;
  return bills.filter((b) => [b.number, b.month, b.paidOn, b.due, UTILITY_NAMES[b.utility], b.note].some((v) => v?.toLowerCase().includes(q)));
}

export interface MonthSpend {
  month: string;
  water: number;
  gas: number;
  total: number;
}

const addMonths = (ym: string, n: number): string => {
  const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Spend per month by the month the bill is for, the last `count` months up to `endMonth`; months without bills are zero. */
export function monthlySpend(bills: UtilityBill[], endMonth: string, count = 12): MonthSpend[] {
  const rows = new Map<string, MonthSpend>();
  for (let i = count - 1; i >= 0; i--) {
    const month = addMonths(endMonth, -i);
    rows.set(month, { month, water: 0, gas: 0, total: 0 });
  }
  for (const b of bills) {
    const row = rows.get(b.month);
    if (!row) continue;
    row[b.utility] = round2(row[b.utility] + b.amount);
    row.total = round2(row.total + b.amount);
  }
  return [...rows.values()];
}

export interface YearSummary {
  year: string;
  bills: number;
  total: number;
  water: number;
  gas: number;
  /** Kevin's own part of the total (half before `soleFrom`). */
  kevin: number;
  waterM3: number;
  gasSm3: number;
}

export function yearSummary(bills: UtilityBill[], year: string, soleFrom = SOLE_FROM): YearSummary {
  const s: YearSummary = { year, bills: 0, total: 0, water: 0, gas: 0, kevin: 0, waterM3: 0, gasSm3: 0 };
  for (const b of bills) {
    if (!b.month.startsWith(year)) continue;
    s.bills++;
    s.total += b.amount;
    s[b.utility] += b.amount;
    s.kevin += kevinShare(b, soleFrom);
    if (b.utility === 'water') s.waterM3 += b.consumption ?? 0;
    else s.gasSm3 += b.consumption ?? 0;
  }
  return { ...s, total: round2(s.total), water: round2(s.water), gas: round2(s.gas), kevin: round2(s.kevin), waterM3: round2(s.waterM3), gasSm3: round2(s.gasSm3) };
}

export function billYears(bills: UtilityBill[]): string[] {
  return [...new Set(bills.map((b) => b.month.slice(0, 4)))].sort().reverse();
}

export interface PaidByOther {
  /** Bills the other person paid. */
  bills: number;
  /** All they paid, per utility and together. */
  water: number;
  gas: number;
  total: number;
  /** Kevin's part of it: what he may have to pay back (half until `soleFrom`). */
  kevinOwes: number;
}

/** What the other person paid on the bills, and Kevin's part of that (the money he may owe them one day). */
export function paidByOther(bills: UtilityBill[], soleFrom = SOLE_FROM): PaidByOther {
  const r: PaidByOther = { bills: 0, water: 0, gas: 0, total: 0, kevinOwes: 0 };
  for (const b of bills) {
    if (b.paidBy !== 'other' || !isPaid(b)) continue;
    r.bills++;
    r[b.utility] += b.amount;
    r.total += b.amount;
    r.kevinOwes += kevinShare(b, soleFrom);
  }
  return { ...r, water: round2(r.water), gas: round2(r.gas), total: round2(r.total), kevinOwes: round2(r.kevinOwes) };
}

export interface ConsumptionPoint {
  month: string;
  consumption: number;
  amount: number;
  /** All-in cost of one unit: the bill's amount ÷ its consumption (fixed fees included). Missing when nothing was used. */
  perUnit?: number;
  estimated: boolean;
}

/** One utility's bills that state their consumption, oldest first, with what a unit cost. */
export function consumptionSeries(bills: UtilityBill[], utility: Utility): ConsumptionPoint[] {
  return bills
    .filter((b) => b.utility === utility && b.consumption !== undefined)
    .sort((a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id))
    .map((b) => ({
      month: b.month,
      consumption: b.consumption!,
      amount: b.amount,
      perUnit: b.consumption! > 0 ? round2(b.amount / b.consumption!) : undefined,
      estimated: !!b.estimated,
    }));
}

/** The bill's own breakdown split into what is charged per unit and the fixed monthly part (lines whose label says "fixed"/"fiksni"/"cuota"). */
export function fixedPart(b: UtilityBill): number {
  return round2((b.lines ?? []).filter((l) => /fiks|fixed|cuota/i.test(l.label)).reduce((a, l) => a + l.amount, 0));
}

export function billTitle(b: UtilityBill): string {
  const d = new Date(`${b.month}-01T00:00:00Z`);
  return `${UTILITY_NAMES[b.utility]} · ${d.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
}
