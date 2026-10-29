// Tiny IndexedDB wrapper. Every feature module gets its own object store,
// keyed by `id`. To add a store: append it to STORES and bump DB_VERSION.
//
// Local writes also queue a change in the `outbox` store, which the sync
// engine (sync.ts) pushes to the server. Remote changes are applied through
// applyRemote() and never re-queued.

import type { Change } from '../../worker/protocol';

export const STORES = ['clothes', 'outfits', 'trips', 'plans', 'settings', 'inbox', 'workdays', 'workevents'] as const;
export type StoreName = (typeof STORES)[number];

const DB_NAME = 'life';
const DB_VERSION = 8;
const OUTBOX = 'outbox';
const META = 'meta';

export interface Entity {
  id: string;
}

export interface OutboxEntry extends Change {
  key: string;
}

type Listener = () => void;
const listeners = new Map<StoreName, Set<Listener>>();

/**
 * Subscribes to changes made outside a single put/remove: records pulled from
 * the server, imports and restores. Returns an unsubscribe function.
 */
export function onExternalChange(store: StoreName, fn: Listener): () => void {
  if (!listeners.has(store)) listeners.set(store, new Set());
  listeners.get(store)!.add(fn);
  return () => listeners.get(store)!.delete(fn);
}

/** Tells mounted collections to reload after records were written outside useCollection. */
export function notify(store: StoreName): void {
  listeners.get(store)?.forEach((fn) => fn());
}

let outboxListener: Listener | null = null;
/** The sync engine registers here to hear about new local writes. */
export function onLocalWrite(fn: Listener | null): void {
  outboxListener = fn;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        }
        if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
        // An older build skips pulled records for stores it doesn't know, yet still advances
        // its cursor past them. After an upgrade, pull everything again so they arrive.
        // (Pulled records never overwrite local edits that haven't been pushed yet.)
        if (event.oldVersion > 0) req.transaction!.objectStore(META).delete('syncCursor');
      };
      req.onsuccess = () => {
        // Let a newer build in another tab upgrade the database instead of being blocked by this one.
        req.result.onversionchange = () => {
          req.result.close();
          dbPromise = null;
        };
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/** Test hook: forget the cached connection. */
export async function closeDb(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(t: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function outboxEntry(store: StoreName, id: string, value: Entity | null): OutboxEntry {
  return {
    key: `${store}:${id}`,
    store,
    id,
    data: value ? JSON.stringify(value) : null,
    updatedAt: Date.now(),
  };
}

export async function getAll<T extends Entity>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return request(db.transaction(store, 'readonly').objectStore(store).getAll()) as Promise<T[]>;
}

export async function put<T extends Entity>(store: StoreName, value: T): Promise<void> {
  const db = await openDb();
  const t = db.transaction([store, OUTBOX], 'readwrite');
  t.objectStore(store).put(value);
  t.objectStore(OUTBOX).put(outboxEntry(store, value.id, value));
  await done(t);
  outboxListener?.();
}

export async function remove(store: StoreName, id: string): Promise<void> {
  const db = await openDb();
  const t = db.transaction([store, OUTBOX], 'readwrite');
  t.objectStore(store).delete(id);
  t.objectStore(OUTBOX).put(outboxEntry(store, id, null));
  await done(t);
  outboxListener?.();
}

/** Replaces the entire contents of a store in one transaction (used by backup restore). */
export async function replaceAll<T extends Entity>(store: StoreName, values: T[]): Promise<void> {
  const db = await openDb();
  const existing = (await getAll<T>(store)).map((v) => v.id);
  const keep = new Set(values.map((v) => v.id));
  const t = db.transaction([store, OUTBOX], 'readwrite');
  const os = t.objectStore(store);
  const outbox = t.objectStore(OUTBOX);
  for (const id of existing) {
    if (!keep.has(id)) {
      os.delete(id);
      outbox.put(outboxEntry(store, id, null));
    }
  }
  for (const v of values) {
    os.put(v);
    outbox.put(outboxEntry(store, v.id, v));
  }
  await done(t);
  outboxListener?.();
  notify(store);
}

/**
 * Writes records that are new, or newer (by `updatedAt`) than the stored copy,
 * in one transaction. Returns how many were written.
 */
export async function upsertNewer<T extends Entity & { updatedAt?: string }>(
  store: StoreName,
  values: T[],
): Promise<number> {
  const db = await openDb();
  const existing = new Map((await getAll<T>(store)).map((v) => [v.id, v]));
  const fresh = values.filter((v) => {
    const old = existing.get(v.id);
    return !old || (v.updatedAt ?? '') > (old.updatedAt ?? '');
  });
  if (fresh.length === 0) return 0;
  const t = db.transaction([store, OUTBOX], 'readwrite');
  for (const v of fresh) {
    t.objectStore(store).put(v);
    t.objectStore(OUTBOX).put(outboxEntry(store, v.id, v));
  }
  await done(t);
  outboxListener?.();
  notify(store);
  return fresh.length;
}

// ---- Sync support ----

export async function getOutbox(): Promise<OutboxEntry[]> {
  const db = await openDb();
  return request(db.transaction(OUTBOX, 'readonly').objectStore(OUTBOX).getAll());
}

/** Removes pushed entries, unless they were edited again while the push was in flight. */
export async function clearOutbox(sent: OutboxEntry[]): Promise<void> {
  const db = await openDb();
  const t = db.transaction(OUTBOX, 'readwrite');
  const os = t.objectStore(OUTBOX);
  for (const entry of sent) {
    const req = os.get(entry.key);
    req.onsuccess = () => {
      const current = req.result as OutboxEntry | undefined;
      if (current && current.updatedAt === entry.updatedAt && current.data === entry.data) {
        os.delete(entry.key);
      }
    };
  }
  await done(t);
}

/** Applies server changes, skipping records with unpushed local edits. */
export async function applyRemote(changes: Change[]): Promise<void> {
  const relevant = changes.filter((c): c is Change & { store: StoreName } =>
    (STORES as readonly string[]).includes(c.store),
  );
  if (relevant.length === 0) return;
  const stores = [...new Set(relevant.map((c) => c.store))];
  const db = await openDb();
  const t = db.transaction([...stores, OUTBOX], 'readwrite');
  const outbox = t.objectStore(OUTBOX);
  for (const c of relevant) {
    const pending = outbox.get(`${c.store}:${c.id}`);
    pending.onsuccess = () => {
      if (pending.result) return;
      const os = t.objectStore(c.store);
      if (c.data === null) os.delete(c.id);
      else os.put(JSON.parse(c.data));
    };
  }
  await done(t);
  for (const s of stores) notify(s);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const row = await request(db.transaction(META, 'readonly').objectStore(META).get(key));
  return (row as { value: T } | undefined)?.value;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  const t = db.transaction(META, 'readwrite');
  t.objectStore(META).put({ key, value });
  await done(t);
}

/** Queues every local record for upload; used once when sync first connects. */
export async function queueAll(): Promise<void> {
  const db = await openDb();
  const t = db.transaction([...STORES, OUTBOX], 'readwrite');
  const outbox = t.objectStore(OUTBOX);
  for (const store of STORES) {
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => {
      for (const v of req.result as Entity[]) outbox.put(outboxEntry(store, v.id, v));
    };
  }
  await done(t);
}

export function newId(): string {
  return crypto.randomUUID();
}
