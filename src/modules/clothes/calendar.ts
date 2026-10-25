import type { ClothingItem, Outfit } from './types';

export interface DayWear {
  outfits: Outfit[];
  /** Items worn that day that aren't part of an outfit worn that day. */
  items: ClothingItem[];
}

/** YYYY-MM-DD → what was worn, built from every dated wear. */
export function wearsByDay(items: ClothingItem[], outfits: Outfit[]): Map<string, DayWear> {
  const days = new Map<string, DayWear>();
  const day = (d: string) => {
    let v = days.get(d);
    if (!v) days.set(d, (v = { outfits: [], items: [] }));
    return v;
  };
  for (const o of outfits) for (const d of new Set(o.wears)) day(d).outfits.push(o);
  for (const i of items) {
    for (const d of new Set(i.wears)) {
      const v = day(d);
      if (!v.outfits.some((o) => o.itemIds.includes(i.id))) v.items.push(i);
    }
  }
  return days;
}

export interface CalendarCell {
  date: string;
  inMonth: boolean;
}

/** Weeks (Monday first) covering the month; `month` is 1–12. */
export function monthGrid(year: number, month: number): CalendarCell[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // days since Monday
  const start = addDays(iso(first), -offset);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(start, w * 7 + d);
      return { date, inMonth: date.startsWith(prefix) };
    }),
  );
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** "2026-05" → "2026-04" for n = -1. */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return iso(d).slice(0, 7);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
