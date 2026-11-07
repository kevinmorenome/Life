// Turns the Wolt, Bolt Food and Uber Eats delivery emails Claude read into WoltOrders (see the `add_wolt_orders` tool).
// The input is untrusted: every field is validated and anything off-schema is dropped.
import { round2 } from '../src/modules/wolt/wolt';
import type { TakeoutService, WoltOrder } from '../src/modules/wolt/types';
import { isRealDate } from './groceries';

const MAX_ORDERS = 100;
const MAX_TOTAL = 10_000;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const str = (v: unknown, max = 120): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
};

export interface ParsedWolt {
  /** Orders ready to store, with their ids. */
  orders: Omit<WoltOrder, 'createdAt' | 'updatedAt'>[];
  /** What was dropped, for the tool result. */
  rejected: string[];
}

export function parseWoltOrders(input: unknown, today: string, service: TakeoutService = 'wolt'): ParsedWolt {
  const out: ParsedWolt = { orders: [], rejected: [] };
  if (!Array.isArray(input)) return out;
  const seen = new Set<string>();
  for (const [i, raw] of input.slice(0, MAX_ORDERS).entries()) {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const sourceId = str(r.sourceId, 100)?.replace(/[^A-Za-z0-9_-]/g, '');
    const restaurant = str(r.restaurant);
    const total = typeof r.total === 'number' && Number.isFinite(r.total) && r.total >= 0 && r.total <= MAX_TOTAL ? round2(r.total) : undefined;
    const date = isRealDate(r.date) && r.date <= today ? r.date : undefined;
    if (!sourceId || !restaurant || total === undefined || !date) {
      out.rejected.push(`#${i + 1}: needs sourceId, restaurant, total and a real past date`);
      continue;
    }
    const id = `${service}-${sourceId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const currency = typeof r.currency === 'string' && /^[A-Za-z]{3}$/.test(r.currency) ? r.currency.toUpperCase() : 'EUR';
    out.orders.push({
      id,
      restaurant,
      date,
      time: typeof r.time === 'string' && TIME.test(r.time) ? r.time : undefined,
      total,
      currency,
      city: str(r.city, 60),
      ...(service === 'wolt' ? {} : { service }),
    });
  }
  return out;
}
