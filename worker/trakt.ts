// Trakt watch history, read only. You connect once (device code: the app shows a code that you enter at
// trakt.tv/activate, so no redirect URI is needed and a development app works), the Worker keeps the tokens in the
// `integrations` table (never in `records`, so they never reach a client) and pulls your history
// into the `watched` store as fresh, immutable records with ids `trakt-<history id>`.
// These routes sit behind Cloudflare Access like the sync API.

import { upsertStatement } from './records';

export interface TraktEnv {
  TRAKT_CLIENT_ID?: string;
  TRAKT_CLIENT_SECRET?: string;
}

export interface Tokens {
  token: string;
  refreshToken: string;
  /** Epoch seconds when `token` stops working. */
  expiresAt: number;
}

export interface Connection extends Tokens {
  /** Epoch seconds of the newest play stored so far. */
  cursor: number;
  /** Whether all of history has been walked once; until then each fetch starts from the newest again. */
  historyDone: boolean;
  lastSync: number | null;
}

/** Where the OAuth tokens live. Faked in tests. */
export interface TraktStore {
  get(): Promise<Connection | null>;
  connect(tokens: Tokens): Promise<void>;
  saveTokens(tokens: Tokens): Promise<void>;
  /** Writes play records; `progress` is given only when a walk has finished. */
  savePlays(records: PlayRecord[], progress: { cursor: number; historyDone: boolean } | null, now: number): Promise<void>;
  disconnect(): Promise<void>;
}

export interface TraktContext {
  env: TraktEnv;
  store: TraktStore;
  readOnly: boolean;
  now: Date;
  fetch: typeof fetch;
}

/** What the app stores per play (a movie, or one episode of a show). */
export interface PlayRecord {
  id: string;
  kind: 'movie' | 'episode';
  /** The movie's title, or the show's for an episode. */
  title: string;
  year?: number;
  season?: number;
  number?: number;
  episodeTitle?: string;
  /** Trakt id of the movie, or of the show. */
  traktId?: number;
  slug?: string;
  /** When it was watched, UTC ISO. The app turns it into a local date and time. */
  at: string;
  source: 'trakt';
  createdAt: string;
  updatedAt: string;
}

const PREFIX = '/api/trakt/';
const API = 'https://api.trakt.tv';
const PAGE = 100;
/** Pages per request, to stay well inside the Worker's subrequest limit; the client asks again while `more`. */
const MAX_PAGES = 8;
/** Renew a token that has less than this left. */
const RENEW_WITHIN = 24 * 3600;
/** Trakt asks for a redirect URI when renewing a token; this is the "no redirect" value for apps that use the device code. */
const NO_REDIRECT = 'urn:ietf:wg:oauth:2.0:oob';

export const isTraktPath = (pathname: string): boolean => pathname.startsWith(PREFIX);

interface RawPlay {
  id?: number;
  watched_at?: string;
  type?: string;
  movie?: { title?: string; year?: number; ids?: { trakt?: number; slug?: string } };
  show?: { title?: string; year?: number; ids?: { trakt?: number; slug?: string } };
  episode?: { season?: number; number?: number; title?: string };
}

/** Maps one history entry to a record; null for shapes we can't use (no id, time or title, or not a movie/episode). */
export function playRecord(raw: RawPlay, now: Date): PlayRecord | null {
  if (typeof raw.id !== 'number' || !raw.watched_at || Number.isNaN(Date.parse(raw.watched_at))) return null;
  const at = new Date(raw.watched_at).toISOString();
  const stamp = now.toISOString();
  if (raw.type === 'movie' && raw.movie?.title) {
    const r: PlayRecord = { id: `trakt-${raw.id}`, kind: 'movie', title: raw.movie.title, at, source: 'trakt', createdAt: at, updatedAt: stamp };
    if (raw.movie.year) r.year = raw.movie.year;
    if (raw.movie.ids?.trakt) r.traktId = raw.movie.ids.trakt;
    if (raw.movie.ids?.slug) r.slug = raw.movie.ids.slug;
    return r;
  }
  if (raw.type === 'episode' && raw.show?.title && raw.episode) {
    const r: PlayRecord = { id: `trakt-${raw.id}`, kind: 'episode', title: raw.show.title, at, source: 'trakt', createdAt: at, updatedAt: stamp };
    if (raw.show.year) r.year = raw.show.year;
    if (typeof raw.episode.season === 'number') r.season = raw.episode.season;
    if (typeof raw.episode.number === 'number') r.number = raw.episode.number;
    if (raw.episode.title) r.episodeTitle = raw.episode.title;
    if (raw.show.ids?.trakt) r.traktId = raw.show.ids.trakt;
    if (raw.show.ids?.slug) r.slug = raw.show.ids.slug;
    return r;
  }
  return null;
}

export async function handleTrakt(request: Request, pathname: string, ctx: TraktContext): Promise<Response> {
  const route = pathname.slice(PREFIX.length);
  const { env } = ctx;
  const configured = Boolean(env.TRAKT_CLIENT_ID && env.TRAKT_CLIENT_SECRET);

  if (route === 'status' && request.method === 'GET') {
    const conn = configured ? await ctx.store.get() : null;
    return json({ configured, connected: Boolean(conn), lastSync: conn?.lastSync ?? null });
  }
  if (!configured) return json({ error: 'Trakt is not configured: set TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET' }, 503);
  if (ctx.readOnly) return json({ error: 'This preview is read-only' }, 409);

  if (route === 'device/start' && request.method === 'POST') {
    const res = await ctx.fetch(`${API}/oauth/device/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: env.TRAKT_CLIENT_ID }),
    });
    if (!res.ok) return json({ error: `Trakt answered ${res.status}` }, 502);
    const d = (await res.json()) as { device_code?: string; user_code?: string; verification_url?: string; expires_in?: number; interval?: number };
    if (!d.device_code || !d.user_code) return json({ error: 'Trakt gave no code' }, 502);
    return json({
      deviceCode: d.device_code,
      userCode: d.user_code,
      verificationUrl: d.verification_url ?? 'https://trakt.tv/activate',
      expiresIn: d.expires_in ?? 600,
      interval: d.interval ?? 5,
    });
  }

  if (route === 'device/poll' && request.method === 'POST') {
    const code = (await request.json().catch(() => null) as { deviceCode?: unknown } | null)?.deviceCode;
    if (typeof code !== 'string' || !code) return json({ error: 'deviceCode is required' }, 400);
    const res = await ctx.fetch(`${API}/oauth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, client_id: env.TRAKT_CLIENT_ID, client_secret: env.TRAKT_CLIENT_SECRET }),
    });
    if (res.status === 200) {
      const tokens = tokensFrom((await res.json()) as TokenResponse, ctx.now);
      if (!tokens) return json({ status: 'error' });
      await ctx.store.connect(tokens);
      return json({ status: 'ok' });
    }
    // 400: not entered yet, 429: asked too fast; the rest end this attempt.
    const status: Record<number, string> = { 400: 'pending', 429: 'slow_down', 404: 'error', 409: 'error', 410: 'expired', 418: 'denied' };
    return json({ status: status[res.status] ?? 'error' });
  }

  if (route === 'disconnect' && request.method === 'POST') {
    await ctx.store.disconnect();
    return json({ ok: true });
  }

  if (route === 'sync' && request.method === 'POST') {
    let conn = await ctx.store.get();
    if (!conn) return json({ error: 'Trakt is not connected' }, 409);
    if (conn.expiresAt - ctx.now.getTime() / 1000 < RENEW_WITHIN) {
      // A refresh token is single use: the answer replaces both tokens.
      const tokens = await requestTokens(ctx, { refresh_token: conn.refreshToken, grant_type: 'refresh_token', redirect_uri: NO_REDIRECT }).catch(() => null);
      if (!tokens) return json({ error: 'Trakt sign-in expired: connect again', reconnect: true }, 409);
      await ctx.store.saveTokens(tokens);
      conn = { ...conn, ...tokens };
    }
    const page = Number(new URL(request.url).searchParams.get('page'));
    return sync(conn, ctx, Number.isInteger(page) && page > 1 ? page : 1);
  }

  return json({ error: 'Not found' }, 404);
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  created_at?: number;
}

function tokensFrom(t: TokenResponse, now: Date): Tokens | null {
  if (!t.access_token || !t.refresh_token) return null;
  const created = t.created_at ?? Math.floor(now.getTime() / 1000);
  return { token: t.access_token, refreshToken: t.refresh_token, expiresAt: created + (t.expires_in ?? 7 * 24 * 3600) };
}

async function requestTokens(ctx: TraktContext, body: Record<string, string>): Promise<Tokens | null> {
  const res = await ctx.fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, client_id: ctx.env.TRAKT_CLIENT_ID, client_secret: ctx.env.TRAKT_CLIENT_SECRET }),
  });
  return res.ok ? tokensFrom((await res.json()) as TokenResponse, ctx.now) : null;
}

/**
 * Pages through `sync/history`, newest first. The first time it walks everything; afterwards `start_at`
 * asks only for plays since the stored cursor. The cursor moves only when a walk is complete, because
 * moving it after the newest page would skip the older plays still to come. Re-reading a page is harmless:
 * records are upserted by id.
 */
async function sync(conn: Connection, ctx: TraktContext, firstPage: number): Promise<Response> {
  let page = firstPage;
  let added = 0;
  let finished = false;
  let newest = conn.cursor;
  for (let n = 0; n < MAX_PAGES && !finished; n++, page++) {
    const url = new URL(`${API}/sync/history`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(PAGE));
    if (conn.historyDone && conn.cursor > 0) url.searchParams.set('start_at', new Date(conn.cursor * 1000).toISOString());
    const res = await ctx.fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${conn.token}`,
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': ctx.env.TRAKT_CLIENT_ID!,
      },
    });
    if (res.status === 401) return json({ error: 'Trakt sign-in expired: connect again', reconnect: true }, 409);
    if (!res.ok) return json({ error: `Trakt answered ${res.status}` }, 502);
    const items = (await res.json()) as RawPlay[];
    const records = items.map((i) => playRecord(i, ctx.now)).filter((r): r is PlayRecord => r !== null);
    newest = records.reduce((max, r) => Math.max(max, Math.floor(Date.parse(r.at) / 1000)), newest);
    finished = items.length < PAGE;
    await ctx.store.savePlays(records, finished ? { cursor: newest, historyDone: true } : null, ctx.now.getTime());
    added += records.length;
  }
  return json({ ok: true, added, more: !finished, page });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export function d1TraktStore(db: D1Database): TraktStore {
  return {
    async get() {
      const row = await db
        .prepare('SELECT token, refresh_token, expires_at, cursor, history_done, last_sync FROM integrations WHERE name = ?1')
        .bind('trakt')
        .first<{ token: string; refresh_token: string | null; expires_at: number | null; cursor: number; history_done: number; last_sync: number | null }>();
      if (!row) return null;
      return {
        token: row.token,
        refreshToken: row.refresh_token ?? '',
        expiresAt: row.expires_at ?? 0,
        cursor: row.cursor,
        historyDone: row.history_done === 1,
        lastSync: row.last_sync,
      };
    },
    async connect(t) {
      // Keeps the cursor when reconnecting, so history isn't fetched twice.
      await db
        .prepare(
          `INSERT INTO integrations (name, token, refresh_token, expires_at, cursor) VALUES ('trakt', ?1, ?2, ?3, 0)
           ON CONFLICT (name) DO UPDATE SET token = excluded.token, refresh_token = excluded.refresh_token, expires_at = excluded.expires_at`,
        )
        .bind(t.token, t.refreshToken, t.expiresAt)
        .run();
    },
    async saveTokens(t) {
      await db.prepare('UPDATE integrations SET token = ?1, refresh_token = ?2, expires_at = ?3 WHERE name = ?4').bind(t.token, t.refreshToken, t.expiresAt, 'trakt').run();
    },
    async savePlays(records, progress, now) {
      const stmt = upsertStatement(db);
      await db.batch([
        ...records.map((r) => stmt.bind('watched', r.id, JSON.stringify(r), now)),
        progress
          ? db.prepare('UPDATE integrations SET cursor = ?1, history_done = ?2, last_sync = ?3 WHERE name = ?4').bind(progress.cursor, progress.historyDone ? 1 : 0, now, 'trakt')
          : db.prepare('UPDATE integrations SET last_sync = ?1 WHERE name = ?2').bind(now, 'trakt'),
      ]);
    },
    async disconnect() {
      await db.prepare('DELETE FROM integrations WHERE name = ?1').bind('trakt').run();
    },
  };
}
