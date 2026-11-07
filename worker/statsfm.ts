// stats.fm listening history, read only. stats.fm has no official API, but its public one
// (api.stats.fm/api/v1) answers without a key for a profile whose privacy settings are public.
// The Worker walks the play history oldest first and condenses it into one record per day
// (`musicdays`, id `music-<date>`): a day's totals, plays per hour and its top tracks and artists.
// Per-play records would be 100k+ rows to sync to every device; per-day is about one row a day.
// A day is rewritten when a later fetch sees it again (a recent day can still change), so these
// records are upserted, not insert-if-missing. Behind Cloudflare Access like the sync API.

import { upsertStatement } from './records';

export interface StatsfmContext {
  /** Writes the day records. */
  save(days: MusicDayRecord[], now: number): Promise<void>;
  readOnly: boolean;
  now: Date;
  fetch: typeof fetch;
}

export interface Ranked {
  id: number;
  name: string;
  plays: number;
  /** Tracks only: the first credited artist's name. */
  artist?: string;
}

/** What the app stores per day. */
export interface MusicDayRecord {
  id: string;
  /** Local date in the stats.fm profile's time zone. */
  date: string;
  plays: number;
  /** Milliseconds actually played. */
  ms: number;
  /** Distinct tracks and artists played that day. */
  tracks: number;
  artists: number;
  /** Plays per local hour (24 numbers). */
  hours: number[];
  topTracks: Ranked[];
  topArtists: Ranked[];
  source: 'statsfm';
  updatedAt: string;
}

const PREFIX = '/api/statsfm/';
const API = 'https://api.stats.fm/api/v1';
/** The most plays one request returns (stats.fm caps `limit` at 10000). */
export const PAGE = 10000;
const TOP = 5;
/** Artists named per lookup. */
const LOOKUP = 100;
const USER = /^[A-Za-z0-9_.-]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isStatsfmPath = (pathname: string): boolean => pathname.startsWith(PREFIX);

export const isUser = (s: unknown): s is string => typeof s === 'string' && USER.test(s);

export interface RawStream {
  endTime?: string;
  playedMs?: number;
  trackId?: number;
  trackName?: string;
  artistIds?: number[];
}

// ---- time zones -----------------------------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formatters.set(tz, f);
  }
  return f;
}

/** A usable IANA zone name, else UTC. */
export function validZone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return 'UTC';
  try {
    formatter(tz);
    return tz;
  } catch {
    return 'UTC';
  }
}

function parts(ms: number, tz: string): Record<string, string> {
  const p: Record<string, string> = {};
  for (const part of formatter(tz).formatToParts(new Date(ms))) p[part.type] = part.value;
  return p;
}

/** Local date and hour of an instant. */
export function localParts(ms: number, tz: string): { date: string; hour: number } {
  const p = parts(ms, tz);
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

/** Local time minus UTC, in ms, at an instant. */
function offsetAt(ms: number, tz: string): number {
  const p = parts(ms, tz);
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second)) - Math.floor(ms / 1000) * 1000;
}

/** The instant a local date starts (midnight in `tz`). */
export function startOfDay(date: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return guess - offsetAt(guess - offsetAt(guess, tz), tz);
}

// ---- condensing plays into days -------------------------------------------------------------------------------

export interface DayPlays {
  date: string;
  streams: RawStream[];
  hours: number[];
}

/** Groups plays by local date, oldest day first; plays with no usable time are dropped. */
export function groupByDay(streams: RawStream[], tz: string): DayPlays[] {
  const days = new Map<string, DayPlays>();
  for (const s of streams) {
    const at = Date.parse(s.endTime ?? '');
    if (Number.isNaN(at)) continue;
    const { date, hour } = localParts(at, tz);
    let day = days.get(date);
    if (!day) days.set(date, (day = { date, streams: [], hours: new Array<number>(24).fill(0) }));
    day.streams.push(s);
    day.hours[hour]++;
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** The artists and tracks a day shows, so the names only need looking up for those. */
export function rankDay(day: DayPlays): { tracks: Map<number, { name: string; plays: number; artist?: number }>; artists: Map<number, number>; ms: number } {
  const tracks = new Map<number, { name: string; plays: number; artist?: number }>();
  const artists = new Map<number, number>();
  let ms = 0;
  for (const s of day.streams) {
    ms += s.playedMs ?? 0;
    if (typeof s.trackId === 'number') {
      const t = tracks.get(s.trackId) ?? { name: s.trackName ?? '', plays: 0, artist: s.artistIds?.[0] };
      t.plays++;
      tracks.set(s.trackId, t);
    }
    for (const a of new Set(s.artistIds ?? [])) artists.set(a, (artists.get(a) ?? 0) + 1);
  }
  return { tracks, artists, ms };
}

const byPlays = <T>(a: [number, T], b: [number, T], plays: (v: T) => number) => plays(b[1]) - plays(a[1]) || a[0] - b[0];

/** Artist ids whose names a day's record needs. */
export function namesNeeded(day: DayPlays): number[] {
  const { tracks, artists } = rankDay(day);
  const ids = new Set<number>();
  for (const [id] of [...artists].sort((a, b) => byPlays(a, b, (v) => v)).slice(0, TOP)) ids.add(id);
  for (const [, t] of [...tracks].sort((a, b) => byPlays(a, b, (v) => v.plays)).slice(0, TOP)) if (t.artist !== undefined) ids.add(t.artist);
  return [...ids];
}

export function dayRecord(day: DayPlays, names: Map<number, string>, now: Date): MusicDayRecord {
  const { tracks, artists, ms } = rankDay(day);
  return {
    id: `music-${day.date}`,
    date: day.date,
    plays: day.streams.length,
    ms,
    tracks: tracks.size,
    artists: artists.size,
    hours: day.hours,
    topTracks: [...tracks]
      .sort((a, b) => byPlays(a, b, (v) => v.plays))
      .slice(0, TOP)
      .map(([id, t]) => {
        const artist = t.artist !== undefined ? names.get(t.artist) : undefined;
        return { id, name: t.name, plays: t.plays, ...(artist ? { artist } : {}) };
      }),
    topArtists: [...artists]
      .sort((a, b) => byPlays(a, b, (v) => v))
      .slice(0, TOP)
      .map(([id, plays]) => ({ id, name: names.get(id) ?? '', plays })),
    source: 'statsfm',
    updatedAt: now.toISOString(),
  };
}

// ---- routes ---------------------------------------------------------------------------------------------------

const get = (ctx: StatsfmContext, url: string) => ctx.fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Life/1.0' } });

interface Profile {
  displayName?: string;
  timezone?: string;
  isPlus?: boolean;
  privacySettings?: { profile?: boolean; streams?: boolean };
}

/** The profile, or why it can't be used. */
async function profileOf(ctx: StatsfmContext, user: string): Promise<{ profile: Profile } | { error: string; status: number }> {
  const res = await get(ctx, `${API}/users/${encodeURIComponent(user)}`);
  if (res.status === 404) return { error: `No stats.fm profile "${user}": use the custom ID from your stats.fm profile link`, status: 404 };
  if (!res.ok) return { error: `stats.fm answered ${res.status}`, status: 502 };
  const profile = ((await res.json().catch(() => null)) as { item?: Profile } | null)?.item;
  if (!profile) return { error: 'stats.fm gave no profile', status: 502 };
  if (profile.privacySettings?.streams === false) return { error: 'Your stats.fm listening history is private: make it public in the stats.fm privacy settings', status: 409 };
  return { profile };
}

async function lookupNames(ctx: StatsfmContext, ids: number[]): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  for (let i = 0; i < ids.length; i += LOOKUP) {
    const res = await get(ctx, `${API}/artists/list?ids=${ids.slice(i, i + LOOKUP).join(',')}`);
    if (!res.ok) continue;
    const items = ((await res.json().catch(() => null)) as { items?: { id?: number; name?: string }[] } | null)?.items ?? [];
    for (const a of items) if (typeof a.id === 'number' && a.name) names.set(a.id, a.name);
  }
  return names;
}

export async function handleStatsfm(request: Request, pathname: string, ctx: StatsfmContext): Promise<Response> {
  const route = pathname.slice(PREFIX.length);

  if (route === 'profile' && request.method === 'GET') {
    const user = new URL(request.url).searchParams.get('user');
    if (!isUser(user)) return json({ error: 'Enter your stats.fm custom ID' }, 400);
    const res = await profileOf(ctx, user);
    if ('error' in res) return json({ error: res.error }, res.status);
    return json({ ok: true, name: res.profile.displayName ?? user, timezone: validZone(res.profile.timezone), plus: Boolean(res.profile.isPlus) });
  }

  if (route === 'sync' && request.method === 'POST') {
    if (ctx.readOnly) return json({ error: 'This preview is read-only' }, 409);
    const body = (await request.json().catch(() => null)) as { user?: unknown; from?: unknown } | null;
    if (!isUser(body?.user)) return json({ error: 'Enter your stats.fm custom ID' }, 400);
    if (body?.from !== undefined && !(typeof body.from === 'string' && DATE.test(body.from))) return json({ error: 'from must be a YYYY-MM-DD date' }, 400);

    const res = await profileOf(ctx, body.user);
    if ('error' in res) return json({ error: res.error }, res.status);
    const tz = validZone(res.profile.timezone);

    const url = new URL(`${API}/users/${encodeURIComponent(body.user)}/streams`);
    url.searchParams.set('order', 'asc');
    url.searchParams.set('limit', String(PAGE));
    if (typeof body?.from === 'string') url.searchParams.set('after', String(startOfDay(body.from, tz)));
    const streams = await get(ctx, url.toString());
    if (!streams.ok) return json({ error: `stats.fm answered ${streams.status}` }, 502);
    const items = ((await streams.json().catch(() => null)) as { items?: RawStream[] } | null)?.items ?? [];

    let days = groupByDay(items, tz);
    // A full page ends somewhere in its newest day, which may be only partly in it: leave that day for the
    // next request, which starts at it. A page that is a single day is taken as is and the next one starts after.
    let next: string | null = null;
    if (items.length >= PAGE && days.length > 1) {
      next = days[days.length - 1].date;
      days = days.slice(0, -1);
    } else if (items.length >= PAGE) {
      const last = localParts(Date.parse(items[items.length - 1].endTime ?? ''), tz).date;
      next = new Date(Date.parse(`${last}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    }

    const names = await lookupNames(ctx, [...new Set(days.flatMap(namesNeeded))]);
    const records = days.map((d) => dayRecord(d, names, ctx.now));
    if (records.length) await ctx.save(records, ctx.now.getTime());
    return json({ ok: true, days: records.length, plays: records.reduce((n, r) => n + r.plays, 0), next, newest: records.length ? records[records.length - 1].date : null });
  }

  return json({ error: 'Not found' }, 404);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export function d1StatsfmStore(db: D1Database): Pick<StatsfmContext, 'save'> {
  return {
    async save(days, now) {
      const stmt = upsertStatement(db);
      // Batches stay well under D1's limits on statements per call.
      for (let i = 0; i < days.length; i += 50) {
        await db.batch(days.slice(i, i + 50).map((d) => stmt.bind('musicdays', d.id, JSON.stringify(d), now)));
      }
    },
  };
}
