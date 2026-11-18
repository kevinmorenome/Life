// What was ordered: pure helpers over takeout orders, their item lines, your dish groups and your likes / notes.
// Shared by the app and the MCP tools (type-only imports).
import type { DishFeedback, DishGroup, TakeoutDetail, WoltOrder } from './types';
import { isEuro, placeName, round2 } from './wolt';

/** Key of a dish at a venue: branches combined, case and spacing ignored. The raw name is never changed. */
export const dishKey = (venue: string, name: string) => `${placeName(venue).toLowerCase().replace(/\s+/g, ' ')}|${name.toLowerCase().replace(/\s+/g, ' ').trim()}`;

export interface DishLine {
  orderId: string;
  date: string;
  time?: string;
  /** Venue with branches combined. */
  venue: string;
  currency: string;
  /** Raw name as printed. */
  raw: string;
  /** Your group for it, else the raw name. */
  dish: string;
  key: string;
  qty: number;
  unitPrice: number;
  linePrice: number;
}

/** Every item line of every order that has details, newest first. `groups` rename lines by their key. */
export function dishLines(orders: WoltOrder[], details: TakeoutDetail[], groups: Pick<DishGroup, 'key' | 'group'>[] = []): DishLine[] {
  const byOrder = new Map(orders.map((o) => [o.id, o]));
  const names = new Map(groups.map((g) => [g.key, g.group.trim()]));
  const out: DishLine[] = [];
  for (const d of details) {
    const o = byOrder.get(d.orderId);
    if (!o) continue;
    for (const i of d.items) {
      const key = dishKey(o.restaurant, i.name);
      out.push({ orderId: o.id, date: o.date, time: o.time, venue: placeName(o.restaurant), currency: o.currency, raw: i.name, dish: names.get(key) || i.name.replace(/\s+/g, ' ').trim(), key, qty: i.qty, unitPrice: i.unitPrice, linePrice: i.linePrice });
    }
  }
  return out.sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`));
}

/** Items subtotal and the rest of the order total (delivery, service fee, tip…), which is never an error. */
export function feesOf(order: WoltOrder, detail?: Pick<TakeoutDetail, 'itemsSubtotal'>): { items: number; fees: number } | undefined {
  return detail ? { items: detail.itemsSubtotal, fees: round2(order.total - detail.itemsSubtotal) } : undefined;
}

export interface DishRow {
  dish: string;
  /** Pieces ordered. */
  count: number;
  /** Orders it was in. */
  orders: number;
  /** Euro spend; other currencies are left out. */
  spent: number;
  venues: string[];
  first: string;
  last: string;
}

export interface LineFilter {
  venue?: string;
  /** Words, all of which must appear in the raw name or the group. */
  query?: string;
  from?: string;
  to?: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function filterLines(lines: DishLine[], f: LineFilter): DishLine[] {
  const words = norm(f.query ?? '').split(/\s+/).filter(Boolean);
  const venue = f.venue ? norm(placeName(f.venue)) : '';
  return lines.filter((l) => {
    if (f.from && l.date < f.from) return false;
    if (f.to && l.date > f.to) return false;
    if (venue && !norm(l.venue).includes(venue)) return false;
    const hay = norm(`${l.raw} ${l.dish}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Dishes by pieces (`by: 'count'`) or by euro spend. Lines are grouped by their dish name, not the venue. */
export function topDishes(lines: DishLine[], by: 'count' | 'spend' = 'count'): DishRow[] {
  const rows = new Map<string, DishRow & { seen: Set<string>; v: Set<string> }>();
  for (const l of lines) {
    const k = norm(l.dish);
    const r = rows.get(k) ?? { dish: l.dish, count: 0, orders: 0, spent: 0, venues: [], first: l.date, last: l.date, seen: new Set<string>(), v: new Set<string>() };
    r.count += l.qty;
    if (l.currency === 'EUR') r.spent = round2(r.spent + l.linePrice);
    r.seen.add(l.orderId);
    r.v.add(l.venue);
    if (l.date < r.first) r.first = l.date;
    if (l.date > r.last) r.last = l.date;
    rows.set(k, r);
  }
  return [...rows.values()]
    .map(({ seen, v, ...r }) => ({ ...r, orders: seen.size, venues: [...v].sort() }))
    .sort((a, b) => (by === 'count' ? b.count - a.count || b.spent - a.spent : b.spent - a.spent || b.count - a.count) || a.dish.localeCompare(b.dish));
}

export interface VenueRow {
  venue: string;
  orders: number;
  /** Pieces ordered. */
  pieces: number;
  spent: number;
  /** Most ordered dish there. */
  topDish?: string;
}

/** Venues by orders that have item lines (ties: euro spend on items). */
export function topVenues(lines: DishLine[]): VenueRow[] {
  const by = new Map<string, DishLine[]>();
  for (const l of lines) by.set(l.venue.toLowerCase(), [...(by.get(l.venue.toLowerCase()) ?? []), l]);
  return [...by.values()]
    .map((ls) => ({ venue: ls[0].venue, orders: new Set(ls.map((l) => l.orderId)).size, pieces: ls.reduce((s, l) => s + l.qty, 0), spent: round2(ls.filter((l) => l.currency === 'EUR').reduce((s, l) => s + l.linePrice, 0)), topDish: topDishes(ls)[0]?.dish }))
    .sort((a, b) => b.orders - a.orders || b.spent - a.spent || a.venue.localeCompare(b.venue));
}

export interface PricePoint {
  date: string;
  unitPrice: number;
}

/** Unit price of one dish over time, oldest first, euro orders only. */
export function priceTrend(lines: DishLine[], dish: string): PricePoint[] {
  const k = norm(dish);
  return lines
    .filter((l) => l.currency === 'EUR' && norm(l.dish) === k)
    .map((l) => ({ date: l.date, unitPrice: l.unitPrice }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Dishes ordered at least `min` times whose unit price changed, with first and latest price. */
export function repeatPrices(lines: DishLine[], min = 3): { dish: string; times: number; first: number; latest: number; change: number }[] {
  const dishes = new Set(lines.map((l) => norm(l.dish)));
  const out = [];
  for (const k of dishes) {
    const pts = priceTrend(lines.filter((l) => norm(l.dish) === k), k);
    if (pts.length < min) continue;
    const first = pts[0].unitPrice;
    const latest = pts[pts.length - 1].unitPrice;
    if (first === latest) continue;
    out.push({ dish: lines.find((l) => norm(l.dish) === k)!.dish, times: pts.length, first, latest, change: round2(latest - first) });
  }
  return out.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

/** Euro spend on items per month, first to `endMonth`. */
export function itemSpendPerMonth(lines: DishLine[], endMonth: string): { month: string; spent: number }[] {
  const sums = new Map<string, number>();
  for (const l of lines) if (l.currency === 'EUR') sums.set(l.date.slice(0, 7), round2((sums.get(l.date.slice(0, 7)) ?? 0) + l.linePrice));
  if (!sums.size) return [];
  const out: { month: string; spent: number }[] = [];
  for (let m = [...sums.keys()].sort()[0]; m <= endMonth; ) {
    out.push({ month: m, spent: sums.get(m) ?? 0 });
    const [y, mo] = m.split('-').map(Number);
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  }
  return out;
}

/** The newest like / dislike / note for each dish key. */
export function latestFeedback(events: Pick<DishFeedback, 'key' | 'verdict' | 'note' | 'at'>[]): Map<string, { verdict?: DishFeedback['verdict']; note?: string; at: string }> {
  const out = new Map<string, { verdict?: DishFeedback['verdict']; note?: string; at: string }>();
  for (const e of events) {
    const cur = out.get(e.key);
    if (!cur || e.at >= cur.at) out.set(e.key, { verdict: e.verdict, note: e.note, at: e.at });
  }
  return out;
}

/** A change to a dish's feedback on top of the current one: a note keeps the verdict, a verdict keeps the note, `verdict: null` clears it. */
export function mergeFeedback(
  cur: { verdict?: DishFeedback['verdict']; note?: string } | undefined,
  change: { verdict?: DishFeedback['verdict'] | null; note?: string },
): { verdict?: DishFeedback['verdict']; note?: string } {
  const verdict = change.verdict === undefined ? cur?.verdict : (change.verdict ?? undefined);
  const note = change.note === undefined ? cur?.note : change.note.trim() || undefined;
  return { ...(verdict ? { verdict } : {}), ...(note ? { note } : {}) };
}

export interface Unrated {
  venue: string;
  raw: string;
  dish: string;
  key: string;
  lastOrdered: string;
}

/** Dishes from orders on or after `since` that have no like / dislike yet, newest first, one row per dish. */
export function unratedDishes(lines: DishLine[], feedback: ReturnType<typeof latestFeedback>, since = ''): Unrated[] {
  const seen = new Set<string>();
  const out: Unrated[] = [];
  for (const l of lines) {
    if (l.date < since || seen.has(l.key) || feedback.get(l.key)?.verdict) continue;
    seen.add(l.key);
    out.push({ venue: l.venue, raw: l.raw, dish: l.dish, key: l.key, lastOrdered: l.date });
  }
  return out;
}

export const isEuroOrder = isEuro;
