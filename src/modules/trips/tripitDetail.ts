// The plans of one TripIt trip, from the website's own answer for it (`/api/v2/get/trip/uuid/<uuid>/include_objects/true`):
// { Trip, AirObject, LodgingObject, ActivityObject, … }. TripIt writes a single object as an object and several as an
// array, and a flight has its legs in `Segment`. Only what the app needs is read: kind, name, dates, place and the
// country (ISO code) of each place. Pure.

import type { PlanKind, PlanStop, TripitPlan } from '../../../worker/tripitTypes';
import { countryByCode } from '../countries/countries';

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What each kind of object in TripIt's answer is. Notes, maps and directions are not plans. */
const KINDS: Record<string, PlanKind> = {
  AirObject: 'flight',
  LodgingObject: 'lodging',
  ActivityObject: 'activity',
  CarObject: 'car',
  RailObject: 'transit',
  TransportObject: 'transit',
  CruiseObject: 'transit',
  RestaurantObject: 'meal',
  ParkingObject: 'other',
};

const iso = (v: unknown): string | undefined => {
  const s = str(v)?.toUpperCase();
  return s && /^[A-Z]{2}$/.test(s) && countryByCode(s) ? s : undefined;
};

interface When {
  date: string;
  time?: string;
}
function when(v: unknown): When | undefined {
  if (!isObject(v)) return undefined;
  const date = str(v.date);
  if (!date || !DATE.test(date)) return undefined;
  const time = str(v.time)?.slice(0, 5);
  return { date, ...(time ? { time } : {}) };
}

/** The place texts of an address: "Anaheim, United States". */
function addressText(a: unknown): string | undefined {
  if (!isObject(a)) return undefined;
  const country = iso(a.country);
  const parts = [str(a.city), country ? countryByCode(country)?.name : undefined].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

/** Every address on a node with the day it applies to: start addresses on the start day, end ones on the end day. */
function addressStops(node: Raw, start: string, end: string): PlanStop[] {
  const out: PlanStop[] = [];
  const add = (a: unknown, date: string) => {
    const country = isObject(a) ? iso(a.country) : undefined;
    if (country && !out.some((s) => s.country === country && s.date === date)) out.push({ country, date });
  };
  for (const [key, value] of Object.entries(node)) {
    if (/^Start.*Address$/.test(key)) add(value, start);
    else if (/^End.*Address$/.test(key)) add(value, end);
    else if (key === 'Address') {
      // A stay or a visit is in one place for all of its days.
      add(value, start);
      add(value, end);
    }
  }
  return out;
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_');

/** The plans in one trip's answer. `tripRef` is the id of the trip record they belong to. */
export function plansFromDetail(detail: Raw, tripRef: string): TripitPlan[] {
  const tripId = isObject(detail.Trip) ? str(detail.Trip.id) ?? tripRef : tripRef;
  const plans: TripitPlan[] = [];
  for (const [key, value] of Object.entries(detail)) {
    const kind = KINDS[key];
    if (!kind) continue;
    list(value).forEach((o, i) => {
      if (!isObject(o)) return;
      const segments = list(o.Segment).filter(isObject);
      const nodes = segments.length ? segments : [o];
      nodes.forEach((node, j) => {
        const start = when(node.StartDateTime) ?? when(node.DateTime) ?? when(o.StartDateTime) ?? when(o.DateTime);
        if (!start) return;
        const end = when(node.EndDateTime) ?? when(o.EndDateTime) ?? start;
        const endDate = end.date < start.date ? start.date : end.date;
        const id = `tripit-t${safe(tripId)}-${safe(str(o.id) ?? `${key}${i}`)}${segments.length ? `-${safe(str(node.id) ?? String(j))}` : ''}`;
        let title: string;
        let location: string | undefined;
        let stops: PlanStop[];
        if (kind === 'flight') {
          const from = str(node.start_airport_code);
          const to = str(node.end_airport_code);
          const flight = [str(node.marketing_airline_code), str(node.marketing_flight_number)].filter(Boolean).join('');
          title = `${from ?? '?'} → ${to ?? '?'}${flight ? ` (${flight})` : ''}`;
          location = [str(node.start_city_name) ?? from, str(node.end_city_name) ?? to].filter(Boolean).join(' → ') || undefined;
          stops = [
            ...(iso(node.start_country_code) ? [{ country: iso(node.start_country_code)!, date: start.date }] : []),
            ...(iso(node.end_country_code) ? [{ country: iso(node.end_country_code)!, date: endDate }] : []),
          ];
        } else {
          title = str(o.supplier_name) ?? str(o.display_name) ?? str(node.display_name) ?? 'Plan';
          const address = node.Address ?? o.Address ?? node.StartLocationAddress ?? node.StartStationAddress ?? o.StartLocationAddress;
          location = addressText(address);
          stops = addressStops(isObject(node) && node !== o ? { ...o, ...node } : o, start.date, endDate);
        }
        plans.push({
          id,
          kind,
          title: title.slice(0, 120),
          start: start.date,
          ...(start.time ? { startTime: start.time } : {}),
          end: endDate,
          ...(end.time ? { endTime: end.time } : {}),
          allDay: !start.time,
          ...(location ? { location: location.slice(0, 120) } : {}),
          ...(stops.length ? { stops } : {}),
          tripRef,
        });
      });
    });
  }
  return plans.sort((a, b) => a.start.localeCompare(b.start) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.id.localeCompare(b.id));
}
