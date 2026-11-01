import { authorize, type AuthEnv } from './auth';
import { checkinAuthorized, handleCheckin, isCheckinPath, type CheckinEnv } from './checkin';
import { handleMcp, mcpAuthorized, type McpEnv } from './mcp';
import { fetchPhoto } from './receipt';
import { d1Store, upsertStatement } from './records';
import { d1SwarmStore, handleSwarm, isSwarmPath, type SwarmEnv } from './swarm';
import { PULL_LIMIT, validateChanges, type Change, type PullResponse } from './protocol';

interface Env extends AuthEnv, McpEnv, CheckinEnv, SwarmEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Set on PR preview versions: they read real data but never write it. */
  READ_ONLY?: string;
}

interface Row {
  store: string;
  id: string;
  data: string | null;
  client_updated_at: number;
  server_seq: number;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith('/api/') || url.pathname === '/mcp' || url.pathname.startsWith('/mcp/');
    if (!isApi) return env.ASSETS.fetch(request);

    // The phone Shortcut can't sign in through Access either; /mcp/checkin rides on the same Access bypass
    // as /mcp and checks its own secret (a leaked check-in token can't read the closet).
    if (isCheckinPath(url.pathname)) {
      const allowed = await checkinAuthorized(request, url.pathname, env);
      if (allowed === 'unconfigured') return json({ error: 'Check-in is not configured: set the CHECKIN_TOKEN secret' }, 503);
      if (allowed === 'denied') return json({ error: 'Not allowed' }, 401);
      return handleCheckin(request, {
        store: d1Store(env.DB),
        readOnly: env.READ_ONLY === 'true',
        now: new Date(),
      });
    }

    // Claude can't sign in through Access, so /mcp is bypassed there and checks its own secret.
    if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
      const allowed = await mcpAuthorized(request, url.pathname, env);
      if (allowed === 'unconfigured') return json({ error: 'MCP is not configured: set the MCP_TOKEN secret' }, 503);
      if (allowed === 'denied') return json({ error: 'Not allowed' }, 401);
      return handleMcp(request, {
        store: d1Store(env.DB),
        appUrl: url.origin,
        readOnly: env.READ_ONLY === 'true',
        now: new Date(),
        newId: () => crypto.randomUUID(),
        fetchPhoto,
      });
    }

    const auth = await authorize(request, env);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    if (isSwarmPath(url.pathname)) {
      return handleSwarm(request, url.pathname, {
        env,
        store: d1SwarmStore(env.DB),
        readOnly: env.READ_ONLY === 'true',
        now: new Date(),
        // Not the bare global: Workers throw "Illegal invocation" when it's called as a method of another object.
        fetch: (input, init) => fetch(input, init),
      });
    }

    if (url.pathname === '/api/sync/pull' && request.method === 'GET') {
      return pull(env.DB, Number(url.searchParams.get('since') ?? 0) || 0);
    }
    if (url.pathname === '/api/sync/push' && request.method === 'POST') {
      if (env.READ_ONLY === 'true') return json({ error: 'This preview is read-only' }, 409);
      return push(env.DB, request);
    }
    return json({ error: 'Not found' }, 404);
  },
} satisfies ExportedHandler<Env>;

async function pull(db: D1Database, since: number): Promise<Response> {
  const { results } = await db
    .prepare('SELECT * FROM records WHERE server_seq > ? ORDER BY server_seq LIMIT ?')
    .bind(since, PULL_LIMIT + 1)
    .all<Row>();
  const rows = results.slice(0, PULL_LIMIT);
  const body: PullResponse = {
    changes: rows.map((r) => ({ store: r.store, id: r.id, data: r.data, updatedAt: r.client_updated_at })),
    cursor: rows.length ? rows[rows.length - 1].server_seq : since,
    more: results.length > PULL_LIMIT,
  };
  return json(body);
}

async function push(db: D1Database, request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const changes = validateChanges(body);
  if (typeof changes === 'string') return json({ error: changes }, 400);
  if (changes.length === 0) return json({ accepted: 0 });

  // Each statement takes the next sequence number; the batch runs as one
  // transaction. Older edits than what's stored are ignored (last write wins).
  const stmt = upsertStatement(db);
  await db.batch(changes.map((c: Change) => stmt.bind(c.store, c.id, c.data, c.updatedAt)));
  return json({ accepted: changes.length });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
