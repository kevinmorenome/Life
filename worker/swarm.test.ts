import { describe, expect, it } from 'vitest';
import { checkinRecord, handleSwarm, isSwarmPath, type Connection, type SwarmContext, type SwarmStore } from './swarm';

const now = new Date('2026-10-30T12:00:00Z');

function setup(over: Partial<SwarmContext> = {}, conn: Connection | null = { token: 'tok', cursor: 0, lastSync: null }) {
  const saved: { ids: string[]; cursor: number }[] = [];
  let connected: string | undefined;
  let state: Connection | null = conn;
  const store: SwarmStore = {
    get: async () => state,
    connect: async (token) => void (connected = token),
    saveCheckins: async (records, cursor) => {
      saved.push({ ids: records.map((r) => r.id), cursor });
      if (state) state = { ...state, cursor };
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

  it('refuses to write on a preview', async () => {
    const { ctx } = setup({ readOnly: true });
    expect((await call(ctx, '/api/swarm/sync', 'POST')).status).toBe(409);
  });

  it('needs a connection to sync', async () => {
    const { ctx } = setup({}, null);
    expect((await call(ctx, '/api/swarm/sync', 'POST')).status).toBe(409);
  });

  it('stores new check-ins oldest first and moves the cursor', async () => {
    const { ctx, saved, calls } = setup({
      fetch: (async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify({ response: { checkins: { items: [item('a', 100), item('b', 200), { id: 'junk' }] } } }));
      }) as typeof fetch,
    });
    const body = await (await call(ctx, '/api/swarm/sync', 'POST')).json();
    expect(body).toEqual({ ok: true, added: 2, more: false });
    expect(saved).toEqual([{ ids: ['swarm-a', 'swarm-b'], cursor: 200 }]);
    expect(calls[0]).toContain('sort=oldestfirst');
    expect(calls[0]).toContain('afterTimestamp=0');
  });

  it('keeps going while pages are full and says when there is more', async () => {
    let page = 0;
    const full = (from: number) => Array.from({ length: 250 }, (_, i) => item(`${from + i}`, from + i + 1));
    const { ctx, saved } = setup({
      fetch: (async () => new Response(JSON.stringify({ response: { checkins: { items: full(1000 * page++) } } }))) as typeof fetch,
    });
    const body = await (await call(ctx, '/api/swarm/sync', 'POST')).json();
    expect(body).toEqual({ ok: true, added: 2000, more: true });
    expect(saved).toHaveLength(8);
  });

  it('asks to reconnect when Swarm rejects the token', async () => {
    const { ctx } = setup({ fetch: (async () => new Response('{}', { status: 401 })) as typeof fetch });
    const res = await call(ctx, '/api/swarm/sync', 'POST');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reconnect: true });
  });
});
