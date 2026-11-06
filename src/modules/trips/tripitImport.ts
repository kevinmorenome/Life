// Past trips from TripIt's website. The public calendar feed only lists upcoming trips, so older ones are copied out
// of the website's own trip list (a snippet run in your logged-in browser, see Settings → TripIt) and pasted in.
// Pure: text in, trips out.

import { countryByCode, findCountry } from '../countries/countries';
import type { TripitPlan } from '../../../worker/tripitTypes';
import { plansFromDetail } from './tripitDetail';
import type { Trip } from './types';

export interface ImportedTrip {
  /** TripIt's own id for the trip, so importing twice never doubles it. */
  id: string;
  name: string;
  start: string;
  end: string;
  /** "Zadar, Croatia". */
  place?: string;
  /** ISO alpha-2 country code. */
  country?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);

/** A country code or name as an ISO code, or undefined when it is neither. */
function countryCode(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    const s = str(c);
    if (!s) continue;
    const hit = s.length === 2 ? countryByCode(s) : findCountry(s);
    if (hit) return hit.code;
  }
  return undefined;
}

/** One entry, either as the browser snippet writes it ({ id, name, start, end, place, country }) or as TripIt's list gives it. */
function toTrip(raw: unknown): ImportedTrip | null {
  if (!isObject(raw)) return null;
  const address = isObject(raw.PrimaryLocationAddress) ? raw.PrimaryLocationAddress : {};
  const id = str(raw.id) ?? str(raw.uuid);
  const name = str(raw.name) ?? str(raw.display_name);
  const start = str(raw.start) ?? str(raw.start_date);
  const end = str(raw.end) ?? str(raw.end_date) ?? start;
  if (!id || !name || !start || !end || !DATE.test(start) || !DATE.test(end) || end < start) return null;
  const place = str(raw.place) ?? str(raw.primary_location);
  const country = countryCode(raw.country, address.country, place?.split(',').pop());
  return { id, name: name.slice(0, 120), start, end, ...(place ? { place: place.slice(0, 120) } : {}), ...(country ? { country } : {}) };
}

/**
 * The trips in pasted text: a JSON array, TripIt's answer ({ "Trip": [...] }, a single trip too), or its answer for one
 * trip with the plans in it ({ Trip, AirObject, LodgingObject, … }), one or several. Plans come with their trip.
 */
export function parseTripList(text: string): { trips: ImportedTrip[]; plans: TripitPlan[]; skipped: number } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'That is not JSON. Paste what the snippet copied.' };
  }
  const items: { trip: unknown; detail?: Raw }[] = [];
  const visit = (v: unknown) => {
    if (!isObject(v)) return items.push({ trip: v });
    if (!('Trip' in v)) return items.push({ trip: v });
    // One trip's answer with its plans, or a list answer holding the trips.
    if (isObject(v.Trip) && Object.keys(v).some((k) => k.endsWith('Object'))) return items.push({ trip: v.Trip, detail: v });
    for (const t of [v.Trip].flat()) items.push({ trip: t });
  };
  if (Array.isArray(data)) data.forEach(visit);
  else visit(data);
  const seen = new Set<string>();
  const trips: ImportedTrip[] = [];
  const plans: TripitPlan[] = [];
  for (const { trip: raw, detail } of items) {
    const t = toTrip(raw);
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    trips.push(t);
    if (detail) plans.push(...plansFromDetail(detail, `trip-tripit-${t.id}`));
  }
  if (items.length > 0 && trips.length === 0) return { error: 'No trips found in that: each needs an id, a name and start and end dates.' };
  return { trips, plans, skipped: items.length - trips.length };
}

/** The plans to add: ones that are not there yet (same id). */
export function plansToImport(plans: TripitPlan[], existing: Pick<TripitPlan, 'id'>[]): TripitPlan[] {
  const have = new Set(existing.map((p) => p.id));
  return plans.filter((p) => !have.has(p.id));
}

/** The Trip records to add: one per imported trip, never one that is already there (same id). */
export function tripsToImport(imported: ImportedTrip[], existing: Pick<Trip, 'id'>[], now: string): Trip[] {
  const have = new Set(existing.map((t) => t.id));
  return imported
    .map((t): Trip => ({
      id: `trip-tripit-${t.id}`,
      name: t.name,
      ...(t.place ? { destination: t.place } : {}),
      ...(t.country ? { country: t.country } : {}),
      startDate: t.start,
      endDate: t.end,
      itemIds: [],
      extras: [],
      packed: [],
      tripitRef: `tripit-trip-${t.id}`,
      createdAt: now,
      updatedAt: now,
    }))
    .filter((t) => !have.has(t.id));
}
