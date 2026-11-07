// Turns the Bolt / Uber receipt emails Claude read into Rides (see the `add_rides` tool).
// The input is untrusted: every field is validated and anything off-schema is dropped.
import type { Ride } from '../src/modules/rides/types';
import { isRealDate } from './groceries';

const MAX_RIDES = 100;
const MAX_FARE = 5_000;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const round2 = (n: number) => Math.round(n * 100) / 100;

const str = (v: unknown, max = 160): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
};

const positive = (v: unknown, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? round2(v) : undefined;

export interface ParsedRides {
  rides: Omit<Ride, 'createdAt' | 'updatedAt'>[];
  /** What was dropped, for the tool result. */
  rejected: string[];
}

export function parseRides(input: unknown, today: string): ParsedRides {
  const out: ParsedRides = { rides: [], rejected: [] };
  if (!Array.isArray(input)) return out;
  const seen = new Set<string>();
  for (const [i, raw] of input.slice(0, MAX_RIDES).entries()) {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const provider = typeof r.provider === 'string' ? r.provider.trim().toLowerCase() : '';
    const sourceId = str(r.sourceId, 100)?.replace(/[^A-Za-z0-9_-]/g, '');
    const fare = typeof r.fare === 'number' && Number.isFinite(r.fare) && r.fare >= 0 && r.fare <= MAX_FARE ? round2(r.fare) : undefined;
    const date = isRealDate(r.date) && r.date <= today ? r.date : undefined;
    if ((provider !== 'bolt' && provider !== 'uber') || !sourceId || fare === undefined || !date) {
      out.rejected.push(`#${i + 1}: needs provider (bolt or uber), sourceId, fare and a real past date`);
      continue;
    }
    const id = `ride-${provider}-${sourceId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.rides.push({
      id,
      provider,
      date,
      time: typeof r.time === 'string' && TIME.test(r.time) ? r.time : undefined,
      from: str(r.from),
      to: str(r.to),
      fare,
      currency: typeof r.currency === 'string' && /^[A-Za-z]{3}$/.test(r.currency) ? r.currency.toUpperCase() : 'EUR',
      distanceKm: positive(r.distanceKm, 5_000),
      durationMin: positive(r.durationMin, 1_440),
      city: str(r.city, 60),
    });
  }
  return out;
}
