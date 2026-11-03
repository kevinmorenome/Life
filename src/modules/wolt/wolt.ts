import type { TakeoutService, WoltOrder } from './types';

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** "McDonald's - Rotor" → "McDonald's": branches of one place are combined. */
export function placeName(restaurant: string): string {
  const head = restaurant.split(/\s+[-–—]\s+/)[0]?.trim();
  return head || restaurant.trim();
}

export const SERVICE_NAMES: Record<TakeoutService, string> = { wolt: 'Wolt', bolt: 'Bolt Food', uber: 'Uber Eats' };
export const serviceOf = (o: WoltOrder): TakeoutService => o.service ?? 'wolt';

/** Orders per service, most used first; services without orders are left out. */
export function byService(orders: WoltOrder[]): { service: TakeoutService; orders: number; spent: number }[] {
  const rows = new Map<TakeoutService, { service: TakeoutService; orders: number; spent: number }>();
  for (const o of orders) {
    const s = serviceOf(o);
    const r = rows.get(s) ?? { service: s, orders: 0, spent: 0 };
    r.orders++;
    if (isEuro(o)) r.spent = round2(r.spent + o.total);
    rows.set(s, r);
  }
  return [...rows.values()].sort((a, b) => b.orders - a.orders);
}

export const isEuro = (o: WoltOrder) => o.currency === 'EUR';

/** Newest first. */
export function newestFirst(orders: WoltOrder[]): WoltOrder[] {
  return [...orders].sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`));
}

export interface WoltSummary {
  orders: number;
  euroOrders: number;
  spent: number;
  average: number;
  /** First order's date, or undefined with no orders. */
  since?: string;
  yearOrders: number;
  yearSpent: number;
  topPlace?: string;
}

/** Euro orders make the money figures; `year` is the YYYY the "this year" numbers are for. */
export function summarize(orders: WoltOrder[], year: string): WoltSummary {
  const euro = orders.filter(isEuro);
  const spent = round2(euro.reduce((s, o) => s + o.total, 0));
  const inYear = euro.filter((o) => o.date.startsWith(year));
  return {
    orders: orders.length,
    euroOrders: euro.length,
    spent,
    average: euro.length ? round2(spent / euro.length) : 0,
    since: orders.reduce<string | undefined>((a, o) => (!a || o.date < a ? o.date : a), undefined),
    yearOrders: orders.filter((o) => o.date.startsWith(year)).length,
    yearSpent: round2(inYear.reduce((s, o) => s + o.total, 0)),
    topPlace: topPlaces(orders)[0]?.name,
  };
}

export interface PlaceRow {
  name: string;
  orders: number;
  spent: number;
}

/** Places by total euro spend (ties: more orders), branches combined. */
export function topPlaces(orders: WoltOrder[], prefix = ''): PlaceRow[] {
  const rows = new Map<string, PlaceRow>();
  for (const o of orders) {
    if (!isEuro(o) || !o.date.startsWith(prefix)) continue;
    const name = placeName(o.restaurant);
    const key = name.toLowerCase();
    const r = rows.get(key) ?? { name, orders: 0, spent: 0 };
    r.orders++;
    r.spent = round2(r.spent + o.total);
    rows.set(key, r);
  }
  return [...rows.values()].sort((a, b) => b.spent - a.spent || b.orders - a.orders || a.name.localeCompare(b.name));
}

const nextMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/** Euro spend per month from the first order to `endMonth`; months without orders are 0. */
export function monthlySpend(orders: WoltOrder[], endMonth: string): { month: string; spent: number; orders: number }[] {
  const euro = orders.filter(isEuro);
  if (euro.length === 0) return [];
  const first = euro.reduce((a, o) => (o.date < a ? o.date : a), euro[0].date).slice(0, 7);
  const sums = new Map<string, { spent: number; orders: number }>();
  for (const o of euro) {
    const m = o.date.slice(0, 7);
    const s = sums.get(m) ?? { spent: 0, orders: 0 };
    s.spent = round2(s.spent + o.total);
    s.orders++;
    sums.set(m, s);
  }
  const out: { month: string; spent: number; orders: number }[] = [];
  for (let m = first; m <= endMonth; m = nextMonth(m)) out.push({ month: m, spent: sums.get(m)?.spent ?? 0, orders: sums.get(m)?.orders ?? 0 });
  return out;
}

/** Orders per hour of the day (24 numbers). Orders without a time are skipped. */
export function hourCounts(orders: WoltOrder[]): number[] {
  const counts = Array<number>(24).fill(0);
  for (const o of orders) {
    const h = o.time ? Number(o.time.slice(0, 2)) : NaN;
    if (h >= 0 && h < 24) counts[h]++;
  }
  return counts;
}

/** Orders paid in another currency: count and total per currency. */
export function otherCurrencies(orders: WoltOrder[]): { currency: string; orders: number; total: number }[] {
  const rows = new Map<string, { currency: string; orders: number; total: number }>();
  for (const o of orders) {
    if (isEuro(o)) continue;
    const r = rows.get(o.currency) ?? { currency: o.currency, orders: 0, total: 0 };
    r.orders++;
    r.total = round2(r.total + o.total);
    rows.set(o.currency, r);
  }
  return [...rows.values()];
}

/** Every word of the query must appear in the restaurant, the date or the currency. */
export function searchOrders(orders: WoltOrder[], query: string): WoltOrder[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return orders;
  return orders.filter((o) => {
    const hay = `${o.restaurant} ${SERVICE_NAMES[serviceOf(o)]} ${o.date} ${new Date(o.date + 'T00:00:00').toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })} ${o.currency}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Orders grouped by date, each day oldest first. */
export function byDate(orders: WoltOrder[]): Map<string, WoltOrder[]> {
  const days = new Map<string, WoltOrder[]>();
  for (const o of [...orders].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))) {
    const list = days.get(o.date);
    if (list) list.push(o);
    else days.set(o.date, [o]);
  }
  return days;
}
