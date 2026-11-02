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
    expect((await call(ctx, '/api/trakt/device/start', 'POST')).status).toBe(503);
  });

  it('is read only in previews', async () => {
    const { ctx } = setup({ readOnly: true });
    expect((await call(ctx, '/api/trakt/sync', 'POST')).status).toBe(409);
  });

  it('starts a device code and hands back what the app shows', async () => {
    const { ctx, calls } = setup({
      fetch: (async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ device_code: 'dev', user_code: 'ABCD1234', verification_url: 'https://trakt.tv/activate', expires_in: 600, interval: 5 }));
      }) as typeof fetch,
    });
    const res = await call(ctx, '/api/trakt/device/start', 'POST');
    expect(await res.json()).toEqual({ deviceCode: 'dev', userCode: 'ABCD1234', verificationUrl: 'https://trakt.tv/activate', expiresIn: 600, interval: 5 });
    expect(calls[0].url).toBe('https://auth.trakt.tv/oauth/device/code');
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ client_id: 'id' });
  });

  it('reports a Trakt failure when starting', async () => {
    const { ctx } = setup({ fetch: (async () => new Response('{}', { status: 500 })) as typeof fetch });
    expect((await call(ctx, '/api/trakt/device/start', 'POST')).status).toBe(502);
  });

  const poll = (ctx: TraktContext, body: unknown = { deviceCode: 'dev' }) =>
    handleTrakt(new Request('https://life.example/api/trakt/device/poll', { method: 'POST', body: JSON.stringify(body) }), '/api/trakt/device/poll', ctx);

  it('stores the tokens once the code was entered', async () => {
    const { ctx, connected, calls } = setup({
      fetch: (async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 1000, created_at: 5000 }));
      }) as typeof fetch,
    });
    expect(await (await poll(ctx)).json()).toEqual({ status: 'ok' });
    expect(connected()).toEqual({ token: 'a', refreshToken: 'r', expiresAt: 6000 });
    expect(calls[0].url).toBe('https://auth.trakt.tv/oauth/device/token');
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ code: 'dev', client_id: 'id', client_secret: 'secret' });
  });

  it('works without a client secret, which new Trakt apps do not get', async () => {
    const { ctx, connected, calls } = setup({
      env: { TRAKT_CLIENT_ID: 'id' },
      fetch: (async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 1000, created_at: 5000 }));
      }) as typeof fetch,
    });
    expect(await (await call(ctx, '/api/trakt/status')).json()).toMatchObject({ configured: true });
    expect(await (await poll(ctx)).json()).toEqual({ status: 'ok' });
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ code: 'dev', client_id: 'id' });
    expect(connected()).toBeDefined();
  });

  it('maps the answers while the code is not entered yet', async () => {
    const answer = async (status: number) => {
      const { ctx, connected } = setup({ fetch: (async () => new Response('{}', { status })) as typeof fetch });
      const body = (await (await poll(ctx)).json()) as { status: string };
      expect(connected()).toBeUndefined();
      return body.status;
    };
    expect(await answer(400)).toBe('pending');
    expect(await answer(429)).toBe('slow_down');
    expect(await answer(410)).toBe('expired');
    expect(await answer(418)).toBe('denied');
    expect(await answer(404)).toBe('error');
    expect(await answer(500)).toBe('error');
  });

  it('does not connect when Trakt sends no refresh token', async () => {
    const { ctx, connected } = setup({ fetch: (async () => new Response(JSON.stringify({ access_token: 'a' }))) as typeof fetch });
    expect(await (await poll(ctx)).json()).toEqual({ status: 'error' });
    expect(connected()).toBeUndefined();
  });

  it('needs a device code to poll', async () => {
    const { ctx } = setup();
    expect((await poll(ctx, {})).status).toBe(400);
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
    const renewCalls: { url: string; init?: RequestInit }[] = [];
    const renewing = setup(
      {
        fetch: (async (url: string, init?: RequestInit) => {
          renewCalls.push({ url, init });
          return url.endsWith('/oauth/token')
            ? new Response(JSON.stringify({ access_token: 'new', refresh_token: 'new-ref', expires_in: 7200, created_at: nowSec }))
            : new Response('[]');
        }) as typeof fetch,
      },
      soon,
    );
    expect((await call(renewing.ctx, '/api/trakt/sync', 'POST')).status).toBe(200);
    expect(JSON.parse(renewCalls[0].init!.body as string)).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'ref', redirect_uri: 'urn:ietf:wg:oauth:2.0:oob' });
    expect(renewing.tokens).toEqual([{ token: 'new', refreshToken: 'new-ref', expiresAt: nowSec + 7200 }]);

    expect(renewCalls[0].url).toBe('https://auth.trakt.tv/oauth/token');

    // A registered redirect URI is sent instead of the default.
    const custom: { init?: RequestInit }[] = [];
    const withUri = setup(
      {
        env: { TRAKT_CLIENT_ID: 'id', TRAKT_REDIRECT_URI: 'https://life.example/callback' },
        fetch: (async (url: string, init?: RequestInit) => {
          custom.push({ init });
          return url.endsWith('/oauth/token') ? new Response(JSON.stringify({ access_token: 'n', refresh_token: 'r2', expires_in: 7200, created_at: nowSec })) : new Response('[]');
        }) as typeof fetch,
      },
      soon,
    );
    await call(withUri.ctx, '/api/trakt/sync', 'POST');
    const sent = JSON.parse(custom[0].init!.body as string);
    expect(sent).toMatchObject({ redirect_uri: 'https://life.example/callback' });
    expect(sent).not.toHaveProperty('client_secret');

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
