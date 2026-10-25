import { authorize, type AuthEnv } from './auth';
import { PULL_LIMIT, validateChanges, type Change, type PullResponse } from './protocol';

interface Env extends AuthEnv {
  DB: D1Database;
  ASSETS: Fetcher;
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
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const auth = await authorize(request, env);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    if (url.pathname === '/api/sync/pull' && request.method === 'GET') {
      return pull(env.DB, Number(url.searchParams.get('since') ?? 0) || 0);
    }
    if (url.pathname === '/api/sync/push' && request.method === 'POST') {
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
  const stmt = db.prepare(
    `INSERT INTO records (store, id, data, client_updated_at, server_seq)
     VALUES (?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(server_seq), 0) + 1 FROM records))
     ON CONFLICT (store, id) DO UPDATE SET
       data = excluded.data,
       client_updated_at = excluded.client_updated_at,
       server_seq = excluded.server_seq
     WHERE excluded.client_updated_at >= records.client_updated_at`,
  );
  await db.batch(changes.map((c: Change) => stmt.bind(c.store, c.id, c.data, c.updatedAt)));
  return json({ accepted: changes.length });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
