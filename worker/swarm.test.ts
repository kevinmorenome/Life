import { describe, expect, it } from 'vitest';
import { checkinRecord, handleSwarm, isSwarmPath, type Connection, type SwarmContext, type SwarmStore } from './swarm';

const now = new Date('2026-10-30T12:00:00Z');

function setup(over: Partial<SwarmContext> = {}, conn: Connection | null = { token: 'tok', cursor: 0, historyDone: false, lastSync: null }) {
  const saved: { ids: string[]; cursor: number; historyDone: boolean }[] = [];
  let connected: string | undefined;
  let state: Connection | null = conn;
  const store: SwarmStore = {
    get: async () => state,
    connect: async (token) => void (connected = token),
    saveCheckins: async (records, { cursor, historyDone }) => {
      saved.push({ ids: records.map((r) => r.id), cursor, historyDone });
      if (state) state = { ...state, cursor, historyDone };
    },
    disconnect: async () => void (state = null),
  };
  const calls: string[] = [];
  const ctx: SwarmContext = {
    env: { FOURSQUARE_CLIENT_ID: 'id', FOURSQUARE_CLIENT_SECRET: 'secret' },
    store,
    readOnly: false,
    now,
    fetch: (async (url: string) => {
      calls.push(url);
      return new Response('{}');
    }) as typeof fetch,
    ...over,
  };
  return { ctx, saved, calls, connected: () => connected };
}

const call = (ctx: SwarmContext, path: string, method = 'GET', headers: HeadersInit = {}) =>
  handleSwarm(new Request(`https://life.example${path}`, { method, headers }), new URL(`https://x${path}`).pathname, ctx);

const item = (id: string, createdAt: number, extra: object = {}) => ({
  id,
  createdAt,
  timeZoneOffset: 60,
  venue: { id: `v-${id}`, name: `Venue ${id}`, location: { city: 'London', country: 'UK', lat: 51.5, lng: -0.1 }, categories: [{ name: 'Café', primary: true }] },
  ...extra,
});

describe('isSwarmPath', () => {
  it('matches the routes under /api/swarm/ only', () => {
    expect(isSwarmPath('/api/swarm/sync')).toBe(true);
    expect(isSwarmPath('/api/sync/pull')).toBe(false);
  });
});

describe('checkinRecord', () => {
  it('maps a check-in and turns the UTC time into the local date and time', () => {
    // 2026-10-29T23:30:00Z with +60 min offset is 00:30 the next day locally.
    const r = checkinRecord(item('a', Date.UTC(2026, 9, 29, 23, 30) / 1000, { shout: 'hi' }), now);
    expect(r).toMatchObject({ id: 'swarm-a', venue: 'Venue a', venueId: 'v-a', category: 'Café', city: 'London', country: 'UK', lat: 51.5, lng: -0.1, shout: 'hi', date: '2026-10-30', time: '00:30', source: 'swarm' });
  });

  it('skips check-ins without an id, time or venue', () => {
    expect(checkinRecord({ createdAt: 1, venue: { name: 'x' } }, now)).toBeNull();
    expect(checkinRecord({ id: 'a', venue: { name: 'x' } }, now)).toBeNull();
    expect(checkinRecord({ id: 'a', createdAt: 1 }, now)).toBeNull();
  });
});

describe('handleSwarm', () => {
  it('reports status without needing a connection, and fails closed when not configured', async () => {
    const { ctx } = setup({ env: {} });
    expect(await (await call(ctx, '/api/swarm/status')).json()).toEqual({ configured: false, connected: false, lastSync: null });
    expect((await call(ctx, '/api/swarm/connect')).status).toBe(503);
  });

  it('sends connect to Foursquare with a state cookie, and checks it on the way back', async () => {
    const { ctx, connected } = setup({
      fetch: (async () => new Response(JSON.stringify({ access_token: 'new-token' }))) as typeof fetch,
    });
    const res = await call(ctx, '/api/swarm/connect');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('Location')!);
    expect(location.origin + location.pathname).toBe('https://foursquare.com/oauth2/authenticate');
    expect(location.searchParams.get('redirect_uri')).toBe('https://life.example/api/swarm/callback');
    const state = location.searchParams.get('state')!;
    expect(res.headers.get('Set-Cookie')).toContain(`swarm_state=${state}`);

    const bad = await call(ctx, '/api/swarm/callback?code=c&state=other', 'GET', { Cookie: `swarm_state=${state}` });
    expect(bad.headers.get('Location')).toContain('swarm=state');
    expect(connected()).toBeUndefined();

    const ok = await call(ctx, `/api/swarm/callback?code=c&state=${state}`, 'GET', { Cookie: `swarm_state=${state}` });
    expect(ok.headers.get('Location')).toBe('https://life.example/?swarm=ok#/settings');
    expect(connected()).toBe('new-token');
  });

  it('goes back to Settings with an error instead of crashing when the token exchange throws', async () => {
    const { ctx, connected } = setup({
      fetch: (async () => {
        throw new TypeError('Illegal invocation');
      }) as typeof fetch,
    });
    const res = await call(ctx, '/api/swarm/connect');
    const state = new URL(res.headers.get('Location')!).searchParams.get('state')!;
    const back = await call(ctx, `/api/swarm/callback?code=c&state=${state}`, 'GET', { Cookie: `swarm_state=${state}` });
    expect(back.headers.get('Location')).toBe('https://life.example/?swarm=error#/settings');
    expect(connected()).toBeUndefined();
  });

  it('refuses to write on a preview', async () => {
    const { ctx } = setup({ readOnly: true });
    expect((await call(ctx, '/api/swarm/sync', 'POST')).status).toBe(409);
  });

  it('needs a connection to sync', async () => {
    const { ctx } = setup({}, null);
    expect((await call(ctx, '/api/swarm/sync', 'POST')).status).toBe(409);
  });

  const reply = (items: object[]) => new Response(JSON.stringify({ response: { checkins: { items } } }));

  it('stores check-ins and moves the cursor, and asks for history with offset (not sort/afterTimestamp)', async () => {
    const { ctx, saved, calls } = setup({
      fetch: (async (url: string) => {
        calls.push(url);
        return reply(calls.length === 1 ? [item('b', 200), item('a', 100), { id: 'junk' }] : []);
      }) as typeof fetch,
    });
    const body = await (await call(ctx, '/api/swarm/sync', 'POST')).json();
    expect(body).toEqual({ ok: true, added: 2, more: false, offset: 3 });
    expect(saved.at(-1)).toEqual({ ids: [], cursor: 200, historyDone: true });
    expect(saved[0]).toEqual({ ids: ['swarm-b', 'swarm-a'], cursor: 200, historyDone: false });
    expect(calls[0]).toContain('offset=0');
    expect(calls[0]).toContain('limit=250');
    expect(calls[0]).not.toContain('sort=');
    expect(calls[0]).not.toContain('afterTimestamp');
  });

  it('keeps paging past a full page, and says where to resume when a request runs out of pages', async () => {
    const offsets: string[] = [];
    const full = (from: number) => Array.from({ length: 250 }, (_, i) => item(`${from + i}`, 100000 - from - i));
    const { ctx, saved } = setup({
      fetch: (async (url: string) => {
        const offset = Number(new URL(url).searchParams.get('offset'));
        offsets.push(String(offset));
        return reply(full(offset));
      }) as typeof fetch,
    });
    const body = await (await call(ctx, '/api/swarm/sync', 'POST')).json();
    expect(body).toEqual({ ok: true, added: 2000, more: true, offset: 2000 });
    expect(offsets).toEqual(['0', '250', '500', '750', '1000', '1250', '1500', '1750']);
    expect(saved.every((s) => !s.historyDone)).toBe(true);

    const next = await call(ctx, '/api/swarm/sync?offset=2000', 'POST');
    expect(await next.json()).toMatchObject({ offset: 4000 });
    expect(offsets[8]).toBe('2000');
  });

  it('after the first full walk, stops at the first check-in it already has', async () => {
    const { ctx, saved } = setup(
      { fetch: (async () => reply([item('new', 500), item('old', 300), item('older', 200)])) as typeof fetch },
      { token: 'tok', cursor: 300, historyDone: true, lastSync: 1 },
    );
    const body = await (await call(ctx, '/api/swarm/sync', 'POST')).json();
    expect(body).toMatchObject({ added: 1, more: false });
    expect(saved).toEqual([{ ids: ['swarm-new'], cursor: 500, historyDone: true }]);
  });

  it('walks the whole history again for a connection whose first walk never finished', async () => {
    const { ctx, saved } = setup(
      { fetch: (async (url: string) => reply(new URL(url).searchParams.get('offset') === '0' ? [item('a', 100)] : [])) as typeof fetch },
      { token: 'tok', cursor: 999, historyDone: false, lastSync: 1 },
    );
    const body = await (await call(ctx, '/api/swarm/sync', 'POST')).json();
    expect(body).toMatchObject({ added: 1, more: false });
    expect(saved[0].ids).toEqual(['swarm-a']);
    expect(saved.at(-1)?.historyDone).toBe(true);
  });

  it('asks to reconnect when Swarm rejects the token', async () => {
    const { ctx } = setup({ fetch: (async () => new Response('{}', { status: 401 })) as typeof fetch });
    const res = await call(ctx, '/api/swarm/sync', 'POST');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reconnect: true });
  });
});
