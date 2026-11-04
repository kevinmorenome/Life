// TripIt trips and plans, read only. You paste your private iCal feed link once (TripIt → Settings → Calendar Feed);
// the Worker keeps it in the `integrations` table (it is a credential: anyone with it can read your plans, so it
// never goes in `records`, which syncs to clients) and turns the feed's events into `TripitPlan` records in the
// `tripitplans` store. Plans can change in TripIt, so they are upserted, but only when their content changed
// (otherwise every fetch would make every client download every plan again). The app never edits them.
// Behind Cloudflare Access like the other integrations.

import { parseIcs, type IcsEvent } from './ics';
import { upsertStatement } from './records';
import type { PlanKind, TripitPlan } from './tripitTypes';

export type { PlanKind, TripitPlan };

export interface Connection {
  url: string;
  lastSync: number | null;
}

/** Where the feed link and the plans live. Faked in tests. */
export interface TripitStore {
  get(): Promise<Connection | null>;
  connect(url: string): Promise<void>;
  /** The stored JSON of every plan, by id, to skip the ones that did not change. */
  existing(): Promise<Map<string, string>>;
  /** Writes the changed plans and the fetch time together. */
  savePlans(plans: TripitPlan[], now: number): Promise<void>;
  disconnect(): Promise<void>;
}

export interface TripitContext {
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
    return { error: 'TripIt did not accept the link. Copy it again from Settings → Calendar Feed (it stops working when it is reset).', status: 409 };
  }
  if (!res.ok) return { error: `TripIt answered ${res.status}`, status: 502 };
  const text = await res.text();
  if (text.length > MAX_BYTES) return { error: 'The feed is too large', status: 502 };
  if (!/^\s*BEGIN:VCALENDAR/i.test(text)) return { error: 'That link did not give a calendar', status: 409 };
  return { text };
}

export async function handleTripit(request: Request, pathname: string, ctx: TripitContext): Promise<Response> {
  const route = pathname.slice(PREFIX.length);

  if (route === 'status' && request.method === 'GET') {
    const conn = await ctx.store.get();
    return json({ connected: !!conn, lastSync: conn?.lastSync ?? null });
  }
  if (ctx.readOnly) return json({ error: 'This preview is read-only' }, 409);

  if (route === 'connect' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
    const url = validateFeedUrl(body?.url);
    if (!url) return json({ error: 'That is not a TripIt calendar feed link (it starts with https://www.tripit.com/feed/ical/)' }, 400);
    const feed = await fetchFeed(url, ctx);
    if ('error' in feed) return json({ error: feed.error }, feed.status);
    await ctx.store.connect(url);
    return json({ ok: true });
  }

  if (route === 'sync' && request.method === 'POST') {
    const conn = await ctx.store.get();
    if (!conn) return json({ error: 'TripIt is not connected' }, 409);
    const feed = await fetchFeed(conn.url, ctx);
    if ('error' in feed) return json({ error: feed.error, ...(feed.status === 409 ? { reconnect: true } : {}) }, feed.status);
    const plans = plansFromFeed(feed.text);
    const existing = await ctx.store.existing();
    const changed = plans.filter((p) => existing.get(p.id) !== JSON.stringify(p));
    await ctx.store.savePlans(changed, ctx.now.getTime());
    return json({ ok: true, plans: plans.length, changed: changed.length });
  }

  if (route === 'disconnect' && request.method === 'POST') {
    await ctx.store.disconnect();
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export function d1TripitStore(db: D1Database): TripitStore {
  return {
    async get() {
      const row = await db
        .prepare('SELECT token, last_sync FROM integrations WHERE name = ?1')
        .bind('tripit')
        .first<{ token: string; last_sync: number | null }>();
      return row ? { url: row.token, lastSync: row.last_sync } : null;
    },
    async connect(url) {
      // The feed link goes in the `token` column: it is the credential.
      await db
        .prepare(
          `INSERT INTO integrations (name, token, cursor) VALUES ('tripit', ?1, 0)
           ON CONFLICT (name) DO UPDATE SET token = excluded.token`,
        )
        .bind(url)
        .run();
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
        db.prepare('UPDATE integrations SET last_sync = ?1 WHERE name = ?2').bind(now, 'tripit'),
      ]);
    },
    async disconnect() {
      await db.prepare('DELETE FROM integrations WHERE name = ?1').bind('tripit').run();
    },
  };
}
