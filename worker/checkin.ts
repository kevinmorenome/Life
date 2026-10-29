// Office check-ins from an Apple Shortcut ("I arrived", "I left", "end of day: not at the office").
// Each one is stored as a fresh `workevents` record, so it can never overwrite a day edited in the
// app; the app turns the events into office/home days. Like /mcp this path is bypassed in Access and
// guarded by its own secret.

import { tokenMatches } from './mcp';
import type { RecordStore } from './records';

export interface CheckinEnv {
  /** Secret that guards /mcp/checkin. Unset = endpoint disabled (fails closed). */
  CHECKIN_TOKEN?: string;
}

export interface CheckinContext {
  store: RecordStore;
  readOnly: boolean;
  now: Date;
}

const PREFIX = '/mcp/checkin';
const TYPES = ['arrive', 'leave', 'home'] as const;
/** Local date and time as the phone formats them, e.g. 2026-10-29T09:12:00+01:00 (the offset is ignored). */
const AT = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/;
/** Check-ins from the future are a misconfigured clock, not real. */
const MAX_AHEAD_MS = 36 * 3600_000;

export const isCheckinPath = (pathname: string): boolean => pathname === PREFIX || pathname.startsWith(PREFIX + '/');

/** The token comes as `Authorization: Bearer <token>` or as the path `/mcp/checkin/<token>`. */
export async function checkinAuthorized(request: Request, pathname: string, env: CheckinEnv): Promise<'ok' | 'unconfigured' | 'denied'> {
  if (!env.CHECKIN_TOKEN || env.CHECKIN_TOKEN.length < 24) return 'unconfigured';
  const bearer = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  const fromPath = pathname.startsWith(PREFIX + '/') ? decodeURIComponent(pathname.slice(PREFIX.length + 1)) : undefined;
  for (const given of [bearer, fromPath]) {
    if (given && (await tokenMatches(given, env.CHECKIN_TOKEN))) return 'ok';
  }
  return 'denied';
}

export async function handleCheckin(request: Request, ctx: CheckinContext): Promise<Response> {
  if (request.method !== 'POST') return reply({ error: 'Use POST' }, 405, { Allow: 'POST' });
  if (ctx.readOnly) return reply({ error: 'This preview is read-only' }, 409);

  let body: { type?: unknown; at?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return reply({ error: 'Body must be JSON like {"type":"arrive","at":"2026-10-29T09:12:00+01:00"}' }, 400);
  }
  const type = TYPES.find((t) => t === body?.type);
  if (!type) return reply({ error: `type must be one of: ${TYPES.join(', ')}` }, 400);
  const m = typeof body.at === 'string' ? AT.exec(body.at) : null;
  if (!m) return reply({ error: 'at must be the phone’s local date and time, like 2026-10-29T09:12:00+01:00' }, 400);
  const [, y, mo, d, h, mi] = m;
  const date = `${y}-${mo}-${d}`;
  const time = `${h}:${mi}`;
  const when = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  const valid = new Date(when);
  if (valid.getUTCMonth() !== +mo - 1 || valid.getUTCDate() !== +d || +h > 23 || +mi > 59) {
    return reply({ error: 'at is not a real date and time' }, 400);
  }
  // Compare as if the phone's local time were UTC, with headroom for time zones.
  if (when - ctx.now.getTime() > MAX_AHEAD_MS) return reply({ error: 'at is in the future' }, 400);

  // The same check-in sent twice (a retried Shortcut) lands on the same record.
  const id = `${type}-${date}-${h}${mi}`;
  const stamp = ctx.now.toISOString();
  await ctx.store.put('workevents', id, { id, type, date, time, source: 'shortcut', createdAt: stamp, updatedAt: stamp });
  return reply({ ok: true, id, date, time });
}

function reply(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}
