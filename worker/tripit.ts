// TripIt trips and plans, read only. Your private iCal feed link (TripIt → Settings → Calendar Feed) is a Worker
// secret, `TRIPIT_FEED_URL` (it is a credential: anyone with it can read your plans, so it is set in Cloudflare and
// never reaches the app or `records`, which syncs to clients). The Worker turns the feed's events into `TripitPlan`
// records in the `tripitplans` store. Plans can change in TripIt, so they are upserted, but only when their content changed
// (otherwise every fetch would make every client download every plan again). The app never edits them.
// Behind Cloudflare Access like the other integrations.

import { parseIcs, reportIcs, type IcsEvent, type IcsReport } from './ics';
import { upsertStatement } from './records';
import type { PlanKind, TripitPlan } from './tripitTypes';

export type { PlanKind, TripitPlan };

export interface TripitEnv {
  /** The private calendar feed link, as a Worker secret. */
  TRIPIT_FEED_URL?: string;
}

/** Where the plans and the last fetch time live. Faked in tests. */
export interface TripitStore {
  lastSync(): Promise<number | null>;
  /** The stored JSON of every plan, by id, to skip the ones that did not change. */
  existing(): Promise<Map<string, string>>;
  /** Writes the changed plans and the fetch time together. */
  savePlans(plans: TripitPlan[], now: number): Promise<void>;
}

export interface TripitContext {
  env: TripitEnv;
  store: TripitStore;
  readOnly: boolean;
  now: Date;
  fetch: typeof fetch;
}

const PREFIX = '/api/tripit/';
/** The feed is a few hundred events at most; refuse anything absurd. */
const MAX_BYTES = 5_000_000;
const MAX_DESCRIPTION = 1500;

export const isTripitPath = (pathname: string): boolean => pathname.startsWith(PREFIX);

/**
 * The feed link as an https URL on tripit.com, or null. `webcal://` is what calendar apps copy, so it is accepted.
 * Only TripIt's own feed path is allowed: the Worker fetches this address, so it must not be pointed anywhere else.
 */
export function validateFeedUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let url: URL;
  try {
    url = new URL(input.trim().replace(/^webcal:\/\//i, 'https://'));
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || (host !== 'www.tripit.com' && host !== 'tripit.com')) return null;
  if (!url.pathname.startsWith('/feed/ical/') || url.username || url.password) return null;
  return url.toString();
}

const KINDS: [PlanKind, RegExp][] = [
  ['flight', /\b(flight|flying|airline|airport|boarding)\b/i],
  ['lodging', /\b(hotel|hostel|lodging|airbnb|apartment|resort|check[- ]?in|stay)\b/i],
  ['car', /\b(car rental|rental car|car hire|rent a car|pick[- ]?up|drop[- ]?off|taxi|transfer)\b/i],
  ['transit', /\b(train|rail|bus|ferry|cruise|metro|subway|tram)\b/i],
  ['meal', /\b(restaurant|dinner|lunch|breakfast|brunch|reservation)\b/i],
  ['activity', /\b(tour|ticket|museum|concert|show|event|activity|excursion)\b/i],
];

/** A guess from the words in the title; TripIt's feed doesn't say what kind a plan is. */
export function guessKind(event: Pick<IcsEvent, 'summary' | 'description'>): PlanKind {
  const text = event.summary;
  for (const [kind, re] of KINDS) if (re.test(text)) return kind;
  // The title alone said nothing: try the start of the description before giving up.
  const head = (event.description ?? '').slice(0, 200);
  for (const [kind, re] of KINDS) if (re.test(head)) return kind;
  return 'other';
}

const TRIP_LINE = /^\s*trip(?: name)?\s*:\s*(.+?)\s*$/im;

/** One feed event as a record. Same event, same record: nothing in it depends on when it was fetched. */
export function planRecord(e: IcsEvent): TripitPlan {
  const tripName = e.description ? TRIP_LINE.exec(e.description)?.[1] : undefined;
  return {
    id: `tripit-${e.uid.replace(/[^A-Za-z0-9._-]+/g, '_')}`,
    kind: guessKind(e),
    title: e.summary,
    start: e.start,
    ...(e.startTime ? { startTime: e.startTime } : {}),
    end: e.end,
    ...(e.endTime ? { endTime: e.endTime } : {}),
    allDay: e.allDay,
    ...(e.location ? { location: e.location } : {}),
    ...(tripName ? { tripName } : {}),
    ...(e.description ? { description: e.description.slice(0, MAX_DESCRIPTION) } : {}),
    ...(e.url ? { url: e.url } : {}),
  };
}

/** The plans in a feed, in date order. */
export function plansFromFeed(text: string): TripitPlan[] {
  const seen = new Set<string>();
  return parseIcs(text)
    .map(planRecord)
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .sort((a, b) => (a.start + (a.startTime ?? '')).localeCompare(b.start + (b.startTime ?? '')) || a.id.localeCompare(b.id));
}

/** Downloads the feed. Redirects are not followed: the link is a fixed address and a redirect would be somewhere else. */
async function fetchFeed(url: string, ctx: TripitContext): Promise<{ text: string } | { error: string; status: number }> {
  let res: Response;
  try {
    res = await ctx.fetch(url, { redirect: 'manual', headers: { Accept: 'text/calendar' } });
  } catch {
    return { error: 'Could not reach TripIt', status: 502 };
  }
  if (res.status === 401 || res.status === 403 || res.status === 404 || (res.status >= 300 && res.status < 400)) {
    return { error: 'TripIt did not accept the link. Copy it again from TripIt → Settings → Calendar Feed and update the TRIPIT_FEED_URL secret (it stops working when the feed is reset).', status: 409 };
  }
  if (!res.ok) return { error: `TripIt answered ${res.status}`, status: 502 };
  const text = await res.text();
  if (text.length > MAX_BYTES) return { error: 'The feed is too large', status: 502 };
  if (!/^\s*BEGIN:VCALENDAR/i.test(text)) return { error: 'That link did not give a calendar', status: 409 };
  return { text };
}

export async function handleTripit(request: Request, pathname: string, ctx: TripitContext): Promise<Response> {
  const route = pathname.slice(PREFIX.length);
  const configured = Boolean(ctx.env.TRIPIT_FEED_URL);

  if (route === 'status' && request.method === 'GET') {
    return json({ configured, lastSync: configured ? await ctx.store.lastSync() : null });
  }
  if (ctx.readOnly) return json({ error: 'This preview is read-only' }, 409);

  if (route === 'sync' && request.method === 'POST') {
    if (!configured) return json({ error: 'TripIt is not configured: set the TRIPIT_FEED_URL secret' }, 503);
    const url = validateFeedUrl(ctx.env.TRIPIT_FEED_URL);
    if (!url) return json({ error: 'TRIPIT_FEED_URL is not a TripIt calendar feed link (it starts with https://www.tripit.com/feed/ical/)' }, 503);
    const feed = await fetchFeed(url, ctx);
    if ('error' in feed) return json({ error: feed.error }, feed.status);
    const plans = plansFromFeed(feed.text);
    const existing = await ctx.store.existing();
    const changed = plans.filter((p) => existing.get(p.id) !== JSON.stringify(p));
    await ctx.store.savePlans(changed, ctx.now.getTime());
    // The report holds counts and property names only, so the app can say why a feed gave nothing without showing its content.
    return json({ ok: true, plans: plans.length, changed: changed.length, feed: reportIcs(feed.text) satisfies IcsReport });
  }

  return json({ error: 'Not found' }, 404);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export function d1TripitStore(db: D1Database): TripitStore {
  return {
    async lastSync() {
      const row = await db.prepare('SELECT last_sync FROM integrations WHERE name = ?1').bind('tripit').first<{ last_sync: number | null }>();
      return row?.last_sync ?? null;
    },
    async existing() {
      const { results } = await db
        .prepare('SELECT id, data FROM records WHERE store = ?1 AND data IS NOT NULL')
        .bind('tripitplans')
        .all<{ id: string; data: string }>();
      return new Map(results.map((r) => [r.id, r.data]));
    },
    async savePlans(plans, now) {
      const stmt = upsertStatement(db);
      await db.batch([
        ...plans.map((p) => stmt.bind('tripitplans', p.id, JSON.stringify(p), now)),
        // `token` is NOT NULL and there is nothing to keep here (the link is a Worker secret), so it stays empty.
        db
          .prepare(
            `INSERT INTO integrations (name, token, cursor, last_sync) VALUES ('tripit', '', 0, ?1)
             ON CONFLICT (name) DO UPDATE SET last_sync = excluded.last_sync`,
          )
          .bind(now),
      ]);
    },
  };
}
