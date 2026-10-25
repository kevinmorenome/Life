import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Change, PullResponse } from '../../worker/protocol';
import { validateChanges } from '../../worker/protocol';

/** In-memory stand-in for the Worker, with the same last-write-wins rules as its SQL. */
function fakeServer() {
  const rows = new Map<string, Change & { seq: number }>();
  let seq = 0;
  const handler = async (url: string, init?: RequestInit): Promise<Response> => {
    const u = new URL(url, 'http://x');
    const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } });
    if (u.pathname === '/api/sync/push') {
      const changes = validateChanges(JSON.parse(init!.body as string));
      if (typeof changes === 'string') return new Response(changes, { status: 400 });
      for (const c of changes) {
        const key = `${c.store}:${c.id}`;
        const prev = rows.get(key);
        if (!prev || c.updatedAt >= prev.updatedAt) rows.set(key, { ...c, seq: ++seq });
      }
      return json({ accepted: changes.length });
    }
    const since = Number(u.searchParams.get('since'));
    const changes = [...rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
    const body: PullResponse = {
      changes: changes.map(({ seq: _s, ...c }) => c),
      cursor: changes.length ? changes[changes.length - 1].seq : since,
      more: false,
    };
    return json(body);
  };
  return { rows, handler };
}

/** A fresh browser: its own IndexedDB and fresh module state. */
async function device() {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  const db = await import('./db');
  const sync = await import('./sync');
  await db.getAll('clothes'); // opens the connection against this device's IndexedDB
  return { db, sync };
}

const shirt = { id: 'a', name: 'Shirt', updatedAt: '2026-01-01' };

describe('sync', () => {
  let server: ReturnType<typeof fakeServer>;
  beforeEach(() => {
    server = fakeServer();
    vi.stubGlobal('fetch', vi.fn(server.handler));
  });

  it('queues local writes and clears them after a push', async () => {
    const { db, sync } = await device();
    await db.put('clothes', shirt);
    expect(await db.getOutbox()).toHaveLength(1);
    await sync.syncNow();
    expect(sync.getStatus().state).toBe('synced');
    expect(await db.getOutbox()).toHaveLength(0);
    expect(JSON.parse(server.rows.get('clothes:a')!.data!).name).toBe('Shirt');
  });

  it('moves edits and deletions between two devices', async () => {
    const a = await device();
    await a.db.put('clothes', shirt);
    await a.sync.syncNow();

    const b = await device();
    await b.sync.syncNow();
    expect((await b.db.getAll('clothes')).map((x) => x.id)).toEqual(['a']);

    await b.db.remove('clothes', 'a');
    await b.sync.syncNow();

    expect(server.rows.get('clothes:a')!.data).toBeNull();
  });

  it('uploads data that existed before sync was first enabled', async () => {
    const { db, sync } = await device();
    await db.put('clothes', shirt);
    await db.clearOutbox(await db.getOutbox()); // simulate pre-sync data with no outbox entry
    await sync.syncNow();
    expect(server.rows.has('clothes:a')).toBe(true);
  });

  it('does not let a pulled change overwrite an unpushed local edit', async () => {
    const { db } = await device();
    await db.put('clothes', { ...shirt, name: 'Local' });
    await db.applyRemote([{ store: 'clothes', id: 'a', data: JSON.stringify({ ...shirt, name: 'Remote' }), updatedAt: 1 }]);
    expect((await db.getAll<typeof shirt>('clothes'))[0].name).toBe('Local');
  });

  it('keeps an entry queued if it was edited again during the push', async () => {
    const { db } = await device();
    await db.put('clothes', shirt);
    const sent = await db.getOutbox();
    await db.put('clothes', { ...shirt, name: 'Edited' });
    await db.clearOutbox(sent);
    expect(await db.getOutbox()).toHaveLength(1);
  });

  it('reports states for server responses', async () => {
    const { db, sync } = await device();
    await db.put('clothes', shirt);

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } })));
    await sync.syncNow();
    expect(sync.getStatus().state).toBe('local-only');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"x"}', { status: 503, headers: { 'Content-Type': 'application/json' } })));
    await sync.syncNow();
    expect(sync.getStatus().state).toBe('not-configured');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } })));
    await sync.syncNow();
    expect(sync.getStatus().state).toBe('signed-out');

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await sync.syncNow();
    expect(sync.getStatus().state).toBe('offline');
    expect(await db.getOutbox()).toHaveLength(1); // nothing lost
  });
});

describe('upsertNewer', () => {
  it('adds new records and replaces only older ones', async () => {
    const { db } = await device();
    await db.put('clothes', { ...shirt, name: 'Mine', updatedAt: '2026-05-01' });
    await db.put('clothes', { id: 'b', name: 'Edited later', updatedAt: '2026-12-01' } as typeof shirt);
    const n = await db.upsertNewer('clothes', [
      { ...shirt, name: 'Imported', updatedAt: '2026-10-25' },
      { id: 'b', name: 'Imported', updatedAt: '2026-10-25' },
      { id: 'c', name: 'New', updatedAt: '2026-10-25' },
    ]);
    expect(n).toBe(2);
    const byId = Object.fromEntries((await db.getAll<typeof shirt>('clothes')).map((r) => [r.id, r.name]));
    expect(byId).toEqual({ a: 'Imported', b: 'Edited later', c: 'New' });
  });
});

describe('validateChanges', () => {
  it('rejects malformed input', () => {
    expect(validateChanges({})).toBeTypeOf('string');
    expect(validateChanges({ changes: [{ store: 'Bad Store', id: 'a', data: null, updatedAt: 1 }] })).toBeTypeOf('string');
    expect(validateChanges({ changes: [{ store: 'clothes', id: '', data: null, updatedAt: 1 }] })).toBeTypeOf('string');
    expect(validateChanges({ changes: [{ store: 'clothes', id: 'a', data: 5, updatedAt: 1 }] })).toBeTypeOf('string');
    expect(validateChanges({ changes: [{ store: 'clothes', id: 'a', data: null, updatedAt: 1 }] })).toHaveLength(1);
  });
});
