import { describe, expect, it } from 'vitest';
import { handleTrakt, isTraktPath, playRecord, type Connection, type PlayRecord, type TraktContext, type TraktStore } from './trakt';

const now = new Date('2026-11-02T12:00:00Z');
const nowSec = now.getTime() / 1000;

const conn = (over: Partial<Connection> = {}): Connection => ({ token: 'tok', refreshToken: 'ref', expiresAt: nowSec + 5 * 24 * 3600, cursor: 0, historyDone: false, lastSync: null, ...over });

function setup(over: Partial<TraktContext> = {}, start: Connection | null = conn()) {
  let state = start;
  const saved: { ids: string[]; progress: { cursor: number; historyDone: boolean } | null }[] = [];
  const tokens: object[] = [];
  let connected: object | undefined;
  const store: TraktStore = {
    get: async () => state,
    connect: async (t) => void (connected = t),
    saveTokens: async (t) => {
      tokens.push(t);
      if (state) state = { ...state, ...t };
    },
    savePlays: async (records: PlayRecord[], progress) => {
      saved.push({ ids: records.map((r) => r.id), progress });
      if (state && progress) state = { ...state, ...progress };
    },
    disconnect: async () => void (state = null),
  };
  const calls: { url: string; init?: RequestInit }[] = [];
  const ctx: TraktContext = {
    env: { TRAKT_CLIENT_ID: 'id', TRAKT_CLIENT_SECRET: 'secret' },
    store,
    readOnly: false,
    now,
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response('[]');
    }) as typeof fetch,
    ...over,
  };
  return { ctx, saved, tokens, calls, connected: () => connected };
}

const call = (ctx: TraktContext, path: string, method = 'GET', headers: HeadersInit = {}) =>
  handleTrakt(new Request(`https://life.example${path}`, { method, headers }), new URL(`https://x${path}`).pathname, ctx);

const movie = (id: number, watched_at: string) => ({ id, watched_at, type: 'movie', movie: { title: `Movie ${id}`, year: 2020, ids: { trakt: id * 10, slug: `movie-${id}` } } });
const episode = (id: number, watched_at: string) => ({
  id,
  watched_at,
  type: 'episode',
  show: { title: 'Show', year: 2019, ids: { trakt: 7, slug: 'show' } },
  episode: { season: 2, number: 3, title: 'Pilot' },
});

describe('isTraktPath', () => {
  it('matches the routes under /api/trakt/ only', () => {
    expect(isTraktPath('/api/trakt/sync')).toBe(true);
    expect(isTraktPath('/api/swarm/sync')).toBe(false);
  });
});

describe('playRecord', () => {
  it('maps a movie and an episode', () => {
    expect(playRecord(movie(1, '2026-10-30T20:15:00.000Z'), now)).toMatchObject({ id: 'trakt-1', kind: 'movie', title: 'Movie 1', year: 2020, traktId: 10, slug: 'movie-1', at: '2026-10-30T20:15:00.000Z', source: 'trakt' });
    expect(playRecord(episode(2, '2026-10-30T21:00:00.000Z'), now)).toMatchObject({ id: 'trakt-2', kind: 'episode', title: 'Show', season: 2, number: 3, episodeTitle: 'Pilot', traktId: 7 });
  });

  it('skips entries it cannot use', () => {
    expect(playRecord({ watched_at: '2026-10-30T20:15:00.000Z', type: 'movie', movie: { title: 'x' } }, now)).toBeNull();
    expect(playRecord({ id: 1, type: 'movie', movie: { title: 'x' } }, now)).toBeNull();
    expect(playRecord({ id: 1, watched_at: 'nope', type: 'movie', movie: { title: 'x' } }, now)).toBeNull();
    expect(playRecord({ id: 1, watched_at: '2026-10-30T20:15:00.000Z', type: 'season' }, now)).toBeNull();
    expect(playRecord({ id: 1, watched_at: '2026-10-30T20:15:00.000Z', type: 'episode', show: { title: 'S' } }, now)).toBeNull();
  });
});

describe('handleTrakt', () => {
  it('reports status without a connection, and fails closed when not configured', async () => {
    const { ctx } = setup({ env: {} });
    expect(await (await call(ctx, '/api/trakt/status')).json()).toEqual({ configured: false, connected: false, lastSync: null });
    expect((await call(ctx, '/api/trakt/connect')).status).toBe(503);
  });

  it('is read only in previews', async () => {
    const { ctx } = setup({ readOnly: true });
    expect((await call(ctx, '/api/trakt/sync', 'POST')).status).toBe(409);
  });

  it('sends connect to Trakt with a state cookie, and checks it on the way back', async () => {
    const { ctx, connected } = setup({
      fetch: (async () => new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 1000, created_at: 5000 }))) as typeof fetch,
    });
    const res = await call(ctx, '/api/trakt/connect');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('Location')!);
    expect(location.origin + location.pathname).toBe('https://trakt.tv/oauth/authorize');
    expect(location.searchParams.get('redirect_uri')).toBe('https://life.example/api/trakt/callback');
    const state = location.searchParams.get('state')!;
    expect(res.headers.get('Set-Cookie')).toContain(`trakt_state=${state}`);

    const bad = await call(ctx, `/api/trakt/callback?code=c&state=${state}`, 'GET', { Cookie: 'trakt_state=other' });
    expect(bad.headers.get('Location')).toContain('trakt=state');
    expect(connected()).toBeUndefined();

    const ok = await call(ctx, `/api/trakt/callback?code=c&state=${state}`, 'GET', { Cookie: `trakt_state=${state}` });
    expect(ok.headers.get('Location')).toBe('https://life.example/?trakt=ok#/settings');
    expect(connected()).toEqual({ token: 'a', refreshToken: 'r', expiresAt: 6000 });
  });

  it('reports a refused sign-in', async () => {
    const { ctx } = setup({ fetch: (async () => new Response('{}', { status: 401 })) as typeof fetch });
    const res = await call(ctx, '/api/trakt/callback?code=c&state=s', 'GET', { Cookie: 'trakt_state=s' });
    expect(res.headers.get('Location')).toContain('trakt=token');
  });

  it('needs a connection to sync', async () => {
    const { ctx } = setup({}, null);
    expect((await call(ctx, '/api/trakt/sync', 'POST')).status).toBe(409);
  });

  it('walks all of history on the first sync, moving the cursor only at the end', async () => {
    const first = Array.from({ length: 100 }, (_, i) => movie(1000 - i, '2026-10-30T10:00:00.000Z'));
    const second = [movie(5, '2026-01-01T10:00:00.000Z')];
    const pages = [first, second];
    const { ctx, saved, calls } = setup({
      fetch: (async (url: string) => {
        calls.push({ url });
        return new Response(JSON.stringify(pages[Number(new URL(url).searchParams.get('page')) - 1] ?? []));
      }) as typeof fetch,
    });
    const body = await (await call(ctx, '/api/trakt/sync', 'POST')).json();
    expect(body).toEqual({ ok: true, added: 101, more: false, page: 3 });
    expect(calls.map((c) => new URL(c.url).searchParams.get('start_at'))).toEqual([null, null]);
    expect(saved[0].progress).toBeNull();
    expect(saved[1].progress).toEqual({ cursor: Date.parse('2026-10-30T10:00:00.000Z') / 1000, historyDone: true });
  });

  it('asks only for plays since the cursor once history is done', async () => {
    const { ctx, saved, calls } = setup(
      { fetch: (async (url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify([movie(9, '2026-11-01T20:00:00.000Z')])); }) as typeof fetch },
      conn({ cursor: Date.parse('2026-10-30T10:00:00.000Z') / 1000, historyDone: true }),
    );
    const body = await (await call(ctx, '/api/trakt/sync', 'POST')).json();
    expect(body).toMatchObject({ added: 1, more: false });
    const url = new URL(calls[0].url);
    expect(url.searchParams.get('start_at')).toBe('2026-10-30T10:00:00.000Z');
    const headers = calls[0].init!.headers as Record<string, string>;
    expect(headers).toMatchObject({ Authorization: 'Bearer tok', 'trakt-api-version': '2', 'trakt-api-key': 'id' });
    expect(saved[0].progress).toEqual({ cursor: Date.parse('2026-11-01T20:00:00.000Z') / 1000, historyDone: true });
  });

  it('renews a token that is about to expire, and asks to connect again when that fails', async () => {
    const soon = conn({ expiresAt: nowSec + 3600 });
    const renewing = setup(
      {
        fetch: (async (url: string) =>
          url.endsWith('/oauth/token')
            ? new Response(JSON.stringify({ access_token: 'new', refresh_token: 'new-ref', expires_in: 7200, created_at: nowSec }))
            : new Response('[]')) as typeof fetch,
      },
      soon,
    );
    expect((await call(renewing.ctx, '/api/trakt/sync', 'POST')).status).toBe(200);
    expect(renewing.tokens).toEqual([{ token: 'new', refreshToken: 'new-ref', expiresAt: nowSec + 7200 }]);

    const failing = setup({ fetch: (async () => new Response('{}', { status: 400 })) as typeof fetch }, soon);
    const res = await call(failing.ctx, '/api/trakt/sync', 'POST');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reconnect: true });
  });

  it('asks to connect again when Trakt rejects the token', async () => {
    const { ctx } = setup({ fetch: (async () => new Response('{}', { status: 401 })) as typeof fetch });
    const res = await call(ctx, '/api/trakt/sync', 'POST');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reconnect: true });
  });

  it('disconnects', async () => {
    const { ctx } = setup();
    await call(ctx, '/api/trakt/disconnect', 'POST');
    expect(await (await call(ctx, '/api/trakt/status')).json()).toMatchObject({ connected: false });
  });
});
