// Swarm (Foursquare) check-ins, read only. You connect once (OAuth), the Worker keeps the access token in
// the `integrations` table (never in `records`, so it never reaches a client) and pulls your check-ins
// into the `checkins` store as fresh, immutable records with ids `swarm-<check-in id>`.
// These routes sit behind Cloudflare Access like the sync API; the callback is a browser redirect.

import { upsertStatement } from './records';

export interface SwarmEnv {
  FOURSQUARE_CLIENT_ID?: string;
  FOURSQUARE_CLIENT_SECRET?: string;
}

export interface Connection {
  token: string;
  /** createdAt (epoch seconds) of the newest check-in stored so far. */
  cursor: number;
  lastSync: number | null;
}

/** Where the OAuth token lives. Faked in tests. */
export interface SwarmStore {
  get(): Promise<Connection | null>;
  connect(token: string): Promise<void>;
  /** Writes check-in records and moves the cursor in one go. */
  saveCheckins(records: CheckinRecord[], cursor: number, now: number): Promise<void>;
  disconnect(): Promise<void>;
}

export interface SwarmContext {
  env: SwarmEnv;
  store: SwarmStore;
  readOnly: boolean;
  now: Date;
  fetch: typeof fetch;
}

/** What the app stores per check-in. */
export interface CheckinRecord {
  id: string;
  venueId?: string;
  venue: string;
  category?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  shout?: string;
  /** Local to where you were: YYYY-MM-DD and HH:MM. */
  date: string;
  time: string;
  /** Epoch seconds, as Swarm reports it. */
  at: number;
  source: 'swarm';
  createdAt: string;
  updatedAt: string;
}

const PREFIX = '/api/swarm/';
const AUTHORIZE = 'https://foursquare.com/oauth2/authenticate';
const TOKEN = 'https://foursquare.com/oauth2/access_token';
const CHECKINS = 'https://api.foursquare.com/v2/users/self/checkins';
/** Foursquare API versioning date; responses keep the shape they had on this day. */
const VERSION = '20231010';
const PAGE = 250;
/** Pages per request, to stay well inside the Worker's subrequest limit; the client asks again while `more`. */
const MAX_PAGES = 8;
const STATE_COOKIE = 'swarm_state';

export const isSwarmPath = (pathname: string): boolean => pathname.startsWith(PREFIX);

interface RawCheckin {
  id?: string;
  createdAt?: number;
  timeZoneOffset?: number;
  shout?: string;
  type?: string;
  venue?: {
    id?: string;
    name?: string;
    location?: { lat?: number; lng?: number; city?: string; country?: string };
    categories?: { name?: string; primary?: boolean }[];
  };
}

const two = (n: number) => String(n).padStart(2, '0');

/** Maps one Foursquare check-in to a record; null for shapes we can't use (no id, time or venue). */
export function checkinRecord(raw: RawCheckin, now: Date): CheckinRecord | null {
  if (!raw.id || typeof raw.createdAt !== 'number') return null;
  const venue = raw.venue?.name;
  if (!venue) return null;
  // The offset is minutes east of UTC, so shifting by it and reading the UTC fields gives local wall time.
  const local = new Date((raw.createdAt + (raw.timeZoneOffset ?? 0) * 60) * 1000);
  const loc = raw.venue?.location;
  const category = (raw.venue?.categories?.find((c) => c.primary) ?? raw.venue?.categories?.[0])?.name;
  const stamp = now.toISOString();
  const record: CheckinRecord = {
    id: `swarm-${raw.id}`,
    venue,
    date: `${local.getUTCFullYear()}-${two(local.getUTCMonth() + 1)}-${two(local.getUTCDate())}`,
    time: `${two(local.getUTCHours())}:${two(local.getUTCMinutes())}`,
    at: raw.createdAt,
    source: 'swarm',
    createdAt: new Date(raw.createdAt * 1000).toISOString(),
    updatedAt: stamp,
  };
  if (raw.venue?.id) record.venueId = raw.venue.id;
  if (category) record.category = category;
  if (loc?.city) record.city = loc.city;
  if (loc?.country) record.country = loc.country;
  if (typeof loc?.lat === 'number' && typeof loc?.lng === 'number') {
    record.lat = loc.lat;
    record.lng = loc.lng;
  }
  if (raw.shout) record.shout = raw.shout;
  return record;
}

export async function handleSwarm(request: Request, pathname: string, ctx: SwarmContext): Promise<Response> {
  const route = pathname.slice(PREFIX.length);
  const { env } = ctx;
  const configured = Boolean(env.FOURSQUARE_CLIENT_ID && env.FOURSQUARE_CLIENT_SECRET);

  if (route === 'status' && request.method === 'GET') {
    const conn = configured ? await ctx.store.get() : null;
    return json({ configured, connected: Boolean(conn), lastSync: conn?.lastSync ?? null });
  }
  if (!configured) return json({ error: 'Swarm is not configured: set FOURSQUARE_CLIENT_ID and FOURSQUARE_CLIENT_SECRET' }, 503);
  if (ctx.readOnly) return json({ error: 'This preview is read-only' }, 409);

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}${PREFIX}callback`;

  if (route === 'connect' && request.method === 'GET') {
    const state = crypto.randomUUID();
    const url = new URL(AUTHORIZE);
    url.search = new URLSearchParams({ client_id: env.FOURSQUARE_CLIENT_ID!, response_type: 'code', redirect_uri: redirectUri, state }).toString();
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.toString(),
        'Set-Cookie': `${STATE_COOKIE}=${state}; Path=${PREFIX}; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
        'Cache-Control': 'no-store',
      },
    });
  }

  if (route === 'callback' && request.method === 'GET') {
    const params = new URL(request.url).searchParams;
    const expected = request.headers.get('Cookie')?.match(new RegExp(`(?:^|; )${STATE_COOKIE}=([^;]+)`))?.[1];
    if (!expected || params.get('state') !== expected) return back(origin, 'state');
    const code = params.get('code');
    if (!code) return back(origin, params.get('error') ?? 'denied');
    const url = new URL(TOKEN);
    url.search = new URLSearchParams({
      client_id: env.FOURSQUARE_CLIENT_ID!,
      client_secret: env.FOURSQUARE_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }).toString();
    const res = await ctx.fetch(url.toString());
    const body = res.ok ? ((await res.json()) as { access_token?: string }) : null;
    if (!body?.access_token) return back(origin, 'token');
    await ctx.store.connect(body.access_token);
    return back(origin, 'ok');
  }

  if (route === 'disconnect' && request.method === 'POST') {
    await ctx.store.disconnect();
    return json({ ok: true });
  }

  if (route === 'sync' && request.method === 'POST') {
    const conn = await ctx.store.get();
    if (!conn) return json({ error: 'Swarm is not connected' }, 409);
    return sync(conn, ctx);
  }

  return json({ error: 'Not found' }, 404);
}

async function sync(conn: Connection, ctx: SwarmContext): Promise<Response> {
  let cursor = conn.cursor;
  let added = 0;
  let more = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(CHECKINS);
    url.search = new URLSearchParams({
      oauth_token: conn.token,
      v: VERSION,
      sort: 'oldestfirst',
      limit: String(PAGE),
      afterTimestamp: String(cursor),
    }).toString();
    const res = await ctx.fetch(url.toString());
    if (res.status === 401) return json({ error: 'Swarm sign-in expired: connect again', reconnect: true }, 409);
    if (!res.ok) return json({ error: `Swarm answered ${res.status}` }, 502);
    const body = (await res.json()) as { response?: { checkins?: { items?: RawCheckin[] } } };
    const items = body.response?.checkins?.items ?? [];
    const records = items.map((i) => checkinRecord(i, ctx.now)).filter((r): r is CheckinRecord => r !== null);
    // The cursor advances over every item, including ones we skip, so they aren't asked for again.
    const newest = items.reduce((max, i) => Math.max(max, i.createdAt ?? 0), cursor);
    await ctx.store.saveCheckins(records, newest, ctx.now.getTime());
    added += records.length;
    if (items.length < PAGE || newest === cursor) break;
    cursor = newest;
    more = page === MAX_PAGES - 1;
  }
  return json({ ok: true, added, more });
}

/** Back to Settings, with the outcome in the query string for the page to show. */
function back(origin: string, result: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}/?swarm=${encodeURIComponent(result)}#/settings`,
      'Set-Cookie': `${STATE_COOKIE}=; Path=${PREFIX}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      'Cache-Control': 'no-store',
    },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export function d1SwarmStore(db: D1Database): SwarmStore {
  return {
    async get() {
      const row = await db
        .prepare('SELECT token, cursor, last_sync FROM integrations WHERE name = ?1')
        .bind('swarm')
        .first<{ token: string; cursor: number; last_sync: number | null }>();
      return row ? { token: row.token, cursor: row.cursor, lastSync: row.last_sync } : null;
    },
    async connect(token) {
      // Keeps the cursor when reconnecting, so history isn't fetched twice.
      await db
        .prepare(
          `INSERT INTO integrations (name, token, cursor) VALUES ('swarm', ?1, 0)
           ON CONFLICT (name) DO UPDATE SET token = excluded.token`,
        )
        .bind(token)
        .run();
    },
    async saveCheckins(records, cursor, now) {
      const stmt = upsertStatement(db);
      await db.batch([
        ...records.map((r) => stmt.bind('checkins', r.id, JSON.stringify(r), now)),
        db.prepare('UPDATE integrations SET cursor = ?1, last_sync = ?2 WHERE name = ?3').bind(cursor, now, 'swarm'),
      ]);
    },
    async disconnect() {
      await db.prepare('DELETE FROM integrations WHERE name = ?1').bind('swarm').run();
    },
  };
}
