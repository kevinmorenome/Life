import type { Ride, RideProvider } from './types';

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const PROVIDER_NAME: Record<RideProvider, string> = { bolt: 'Bolt', uber: 'Uber' };
export const isEuro = (r: Ride) => r.currency === 'EUR';

/** Newest first. */
export function newestFirst(rides: Ride[]): Ride[] {
  return [...rides].sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`));
}

/** Rides grouped by date, each day oldest first. */
export function byDate(rides: Ride[]): Map<string, Ride[]> {
  const days = new Map<string, Ride[]>();
  for (const r of [...rides].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))) {
    const list = days.get(r.date);
    if (list) list.push(r);
    else days.set(r.date, [r]);
  }
  return days;
}

/** "Ilica 12, Zagreb" → "Ilica 12": the part before the first comma, for grouping and short labels. */
export function placeLabel(address: string | undefined): string | undefined {
  const head = address?.split(',')[0]?.trim();
  return head || undefined;
}

export interface RideSummary {
  rides: number;
  euroRides: number;
  spent: number;
  average: number;
  since?: string;
  yearRides: number;
  yearSpent: number;
  /** Total kilometres of rides that report a distance. */
  km: number;
  byProvider: { provider: RideProvider; rides: number; spent: number }[];
}

/** Euro rides make the money figures; `year` is the YYYY the "this year" numbers are for. */
export function summarize(rides: Ride[], year: string): RideSummary {
  const euro = rides.filter(isEuro);
  const spent = round2(euro.reduce((s, r) => s + r.fare, 0));
  const inYear = euro.filter((r) => r.date.startsWith(year));
  return {
    rides: rides.length,
    euroRides: euro.length,
    spent,
    average: euro.length ? round2(spent / euro.length) : 0,
    since: rides.reduce<string | undefined>((a, r) => (!a || r.date < a ? r.date : a), undefined),
    yearRides: rides.filter((r) => r.date.startsWith(year)).length,
    yearSpent: round2(inYear.reduce((s, r) => s + r.fare, 0)),
    km: round2(rides.reduce((s, r) => s + (r.distanceKm ?? 0), 0)),
    byProvider: (['bolt', 'uber'] as const)
      .map((provider) => ({
        provider,
        rides: rides.filter((r) => r.provider === provider).length,
        spent: round2(euro.filter((r) => r.provider === provider).reduce((s, r) => s + r.fare, 0)),
      }))
      .filter((p) => p.rides > 0),
  };
}

const nextMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/** Euro spend per month from the first ride to `endMonth`; months without rides are 0. */
export function monthlySpend(rides: Ride[], endMonth: string): { month: string; spent: number; rides: number }[] {
  const euro = rides.filter(isEuro);
  if (euro.length === 0) return [];
  const first = euro.reduce((a, r) => (r.date < a ? r.date : a), euro[0].date).slice(0, 7);
  const sums = new Map<string, { spent: number; rides: number }>();
  for (const r of euro) {
    const m = r.date.slice(0, 7);
    const s = sums.get(m) ?? { spent: 0, rides: 0 };
    s.spent = round2(s.spent + r.fare);
    s.rides++;
    sums.set(m, s);
  }
  const out: { month: string; spent: number; rides: number }[] = [];
  for (let m = first; m <= endMonth; m = nextMonth(m)) out.push({ month: m, spent: sums.get(m)?.spent ?? 0, rides: sums.get(m)?.rides ?? 0 });
  return out;
}

/** Rides per hour of the day (24 numbers). Rides without a time are skipped. */
export function hourCounts(rides: Ride[]): number[] {
  const counts = Array<number>(24).fill(0);
  for (const r of rides) {
    const h = r.time ? Number(r.time.slice(0, 2)) : NaN;
    if (h >= 0 && h < 24) counts[h]++;
  }
  return counts;
}

/** Rides per weekday, Monday first (7 numbers). */
export function weekdayCounts(rides: Ride[]): number[] {
  const counts = Array<number>(7).fill(0);
  for (const r of rides) counts[(new Date(r.date + 'T00:00:00Z').getUTCDay() + 6) % 7]++;
  return counts;
}

export interface PlaceRow {
  name: string;
  rides: number;
}

/** Most common drop-offs (`to`) or pick-ups (`from`), grouped by the street part of the address. */
export function topPlaces(rides: Ride[], which: 'to' | 'from', limit = 10): PlaceRow[] {
  const rows = new Map<string, PlaceRow>();
  for (const r of rides) {
    const name = placeLabel(r[which]);
    if (!name) continue;
    const key = name.toLowerCase();
    const row = rows.get(key) ?? { name, rides: 0 };
    row.rides++;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.rides - a.rides || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Rides paid in another currency: count and total per currency. */
export function otherCurrencies(rides: Ride[]): { currency: string; rides: number; total: number }[] {
  const rows = new Map<string, { currency: string; rides: number; total: number }>();
  for (const r of rides) {
    if (isEuro(r)) continue;
    const row = rows.get(r.currency) ?? { currency: r.currency, rides: 0, total: 0 };
    row.rides++;
    row.total = round2(row.total + r.fare);
    rows.set(r.currency, row);
  }
  return [...rows.values()];
}

/** Every word of the query must appear in the provider, addresses, city, date or currency. */
export function searchRides(rides: Ride[], query: string): Ride[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return rides;
  return rides.filter((r) => {
    const hay = `${PROVIDER_NAME[r.provider]} ${r.from ?? ''} ${r.to ?? ''} ${r.city ?? ''} ${r.date} ${new Date(r.date + 'T00:00:00').toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })} ${r.currency}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
