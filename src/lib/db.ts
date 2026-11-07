// Tiny IndexedDB wrapper. Every feature module gets its own object store,
// keyed by `id`. To add a store: append it to STORES and bump DB_VERSION.
//
// Local writes also queue a change in the `outbox` store, which the sync
// engine (sync.ts) pushes to the server. Remote changes are applied through
// applyRemote() and never re-queued.

import type { Change } from '../../worker/protocol';
import { isPhotoStore, joinPhoto, photoKey, PHOTO_STORES, splitPhoto } from './photoSplit';

export const STORES = ['clothes', 'outfits', 'trips', 'plans', 'settings', 'inbox', 'workdays', 'workevents', 'checkins', 'countries', 'players', 'gametitles', 'gamenights', 'foodreceipts', 'foodproducts', 'foodstock', 'woltorders', 'watched', 'rides', 'musicdays', 'tripitplans'] as const;
export type StoreName = (typeof STORES)[number];

const DB_NAME = 'life';
const DB_VERSION = 20;
/** Pictures were moved out of their records at this version (local only, nothing to re-pull). */
const PHOTOS_VERSION = 18;
const PHOTOS = 'photos';
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
        if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS, { keyPath: 'id' });
        // Move the pictures embedded in existing records into the photos store.
        if (event.oldVersion > 0 && event.oldVersion < PHOTOS_VERSION) {
          const tx = req.transaction!;
          for (const store of PHOTO_STORES) {
            if (!tx.objectStoreNames.contains(store)) continue;
            const cursorReq = tx.objectStore(store).openCursor();
            cursorReq.onsuccess = () => {
              const cursor = cursorReq.result;
              if (!cursor) return;
              const rec = cursor.value as Entity & { photo?: string };
              if (typeof rec.photo === 'string' && rec.photo) {
                const { local, action } = splitPhoto(rec);
                if (action.kind === 'set') tx.objectStore(PHOTOS).put({ id: photoKey(store, rec.id), data: action.data });
                cursor.update(local);
              }
              cursor.continue();
            };
          }
        }
        // (Version 18 only moved pictures locally, so it needs no re-pull.)
        // An older build skips pulled records for stores it doesn't know, yet still advances
        // its cursor past them. After an upgrade, pull everything again so they arrive.
        // (Pulled records never overwrite local edits that haven't been pushed yet.)
        if (event.oldVersion > 0 && event.oldVersion < 17) req.transaction!.objectStore(META).delete('syncCursor');
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

/** Every record of a store. Records of photo stores carry `hasPhoto`, not the image: see getPhoto(). */
export async function getAll<T extends Entity>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return request(db.transaction(store, 'readonly').objectStore(store).getAll()) as Promise<T[]>;
}

// ---- Pictures (kept out of the records, see photoSplit.ts) ----

type PhotoRow = { id: string; data: string };
const PHOTO_CACHE_MAX = 120;
const photoCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | undefined>>();
const photoListeners = new Map<string, Set<Listener>>();

function cachePhoto(key: string, data: string | null): void {
  photoCache.delete(key);
  photoCache.set(key, data);
  if (photoCache.size > PHOTO_CACHE_MAX) photoCache.delete(photoCache.keys().next().value as string);
}

/** Forgets what was cached for a picture and tells whoever is showing it. */
function photoChanged(key: string): void {
  photoCache.delete(key);
  inflight.delete(key);
  photoListeners.get(key)?.forEach((fn) => fn());
}

/** Calls `fn` whenever this record's picture is written, replaced or removed. */
export function onPhotoChange(store: StoreName, id: string, fn: Listener): () => void {
  const key = photoKey(store, id);
  if (!photoListeners.has(key)) photoListeners.set(key, new Set());
  photoListeners.get(key)!.add(fn);
  return () => photoListeners.get(key)?.delete(fn);
}

/** A record's picture as a data URL (undefined when it has none), read from the local photos store. */
export function getPhoto(store: StoreName, id: string): Promise<string | undefined> {
  const key = photoKey(store, id);
  if (photoCache.has(key)) {
    const hit = photoCache.get(key);
    cachePhoto(key, hit ?? null);
    return Promise.resolve(hit ?? undefined);
  }
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = openDb()
    .then((db) => request(db.transaction(PHOTOS, 'readonly').objectStore(PHOTOS).get(key)) as Promise<PhotoRow | undefined>)
    .then((row) => {
      // A write while this was loading cleared `inflight`: don't cache a stale picture over it.
      if (inflight.get(key) === p) cachePhoto(key, row?.data ?? null);
      return row?.data;
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/** Records with their pictures put back: what is uploaded, exported and queued for sync. */
export async function getAllFull<T extends Entity>(store: StoreName): Promise<T[]> {
  const rows = await getAll<T & { hasPhoto?: boolean }>(store);
  if (!isPhotoStore(store) || !rows.some((r) => r.hasPhoto)) return rows;
  const db = await openDb();
  const photos = (await request(db.transaction(PHOTOS, 'readonly').objectStore(PHOTOS).getAll())) as PhotoRow[];
  const byKey = new Map(photos.map((p) => [p.id, p.data]));
  return rows.map((r) => joinPhoto(r, byKey.get(photoKey(store, r.id))));
}

/** The record to keep in the store, plus the full copy for the outbox, with what to do to the photos store. */
async function prepareWrite<T extends Entity>(store: StoreName, value: T) {
  if (!isPhotoStore(store)) return { local: value, full: value as Entity, photo: null as null | { id: string; data: string | null } };
  const { local, action } = splitPhoto(value as T & { photo?: string; hasPhoto?: boolean });
  const key = photoKey(store, value.id);
  let data: string | undefined;
  if (action.kind === 'set') data = action.data;
  else if (action.kind === 'keep') data = await getPhoto(store, value.id);
  const full = joinPhoto(local as T & { hasPhoto?: boolean }, data) as Entity;
  // A `keep` with nothing stored (shouldn't happen) must not leave a flag pointing at nothing.
  const fixed = action.kind === 'keep' && !data ? { ...(local as object), hasPhoto: false } : local;
  return {
    local: fixed as unknown as T,
    full,
    photo: action.kind === 'keep' ? null : { id: key, data: action.kind === 'set' ? action.data : null },
  };
}

function writePhoto(t: IDBTransaction, photo: { id: string; data: string | null } | null): void {
  if (!photo) return;
  const os = t.objectStore(PHOTOS);
  if (photo.data) os.put({ id: photo.id, data: photo.data } satisfies PhotoRow);
  else os.delete(photo.id);
}

/** Saves a record and returns what was stored (for photo stores: without the image, with `hasPhoto`). */
export async function put<T extends Entity>(store: StoreName, value: T): Promise<T> {
  const { local, full, photo } = await prepareWrite(store, value);
  const db = await openDb();
  const t = db.transaction([store, OUTBOX, PHOTOS], 'readwrite');
  t.objectStore(store).put(local);
  t.objectStore(OUTBOX).put(outboxEntry(store, value.id, full));
  writePhoto(t, photo);
  await done(t);
  if (photo) photoChanged(photo.id);
  outboxListener?.();
  return local;
}

export async function remove(store: StoreName, id: string): Promise<void> {
  const db = await openDb();
  const t = db.transaction([store, OUTBOX, PHOTOS], 'readwrite');
  t.objectStore(store).delete(id);
  t.objectStore(OUTBOX).put(outboxEntry(store, id, null));
  if (isPhotoStore(store)) t.objectStore(PHOTOS).delete(photoKey(store, id));
  await done(t);
  if (isPhotoStore(store)) photoChanged(photoKey(store, id));
  outboxListener?.();
}

/** Replaces the entire contents of a store in one transaction (used by backup restore). */
export async function replaceAll<T extends Entity>(store: StoreName, values: T[]): Promise<void> {
  const existing = (await getAll<T>(store)).map((v) => v.id);
  const keep = new Set(values.map((v) => v.id));
  const prepared = await Promise.all(values.map((v) => prepareWrite(store, v)));
  const db = await openDb();
  const t = db.transaction([store, OUTBOX, PHOTOS], 'readwrite');
  const os = t.objectStore(store);
  const outbox = t.objectStore(OUTBOX);
  const changedPhotos: string[] = [];
  for (const id of existing) {
    if (!keep.has(id)) {
      os.delete(id);
      outbox.put(outboxEntry(store, id, null));
      if (isPhotoStore(store)) {
        t.objectStore(PHOTOS).delete(photoKey(store, id));
        changedPhotos.push(photoKey(store, id));
      }
    }
  }
  prepared.forEach((p, i) => {
    os.put(p.local);
    outbox.put(outboxEntry(store, values[i].id, p.full));
    writePhoto(t, p.photo);
    if (p.photo) changedPhotos.push(p.photo.id);
  });
  await done(t);
  changedPhotos.forEach(photoChanged);
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
  const existing = new Map((await getAll<T>(store)).map((v) => [v.id, v]));
  const fresh = values.filter((v) => {
    const old = existing.get(v.id);
    return !old || (v.updatedAt ?? '') > (old.updatedAt ?? '');
  });
  if (fresh.length === 0) return 0;
  const prepared = await Promise.all(fresh.map((v) => prepareWrite(store, v)));
  const db = await openDb();
  const t = db.transaction([store, OUTBOX, PHOTOS], 'readwrite');
  const changedPhotos: string[] = [];
  prepared.forEach((p, i) => {
    t.objectStore(store).put(p.local);
    t.objectStore(OUTBOX).put(outboxEntry(store, fresh[i].id, p.full));
    writePhoto(t, p.photo);
    if (p.photo) changedPhotos.push(p.photo.id);
  });
  await done(t);
  changedPhotos.forEach(photoChanged);
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
  const t = db.transaction([...stores, OUTBOX, PHOTOS], 'readwrite');
  const outbox = t.objectStore(OUTBOX);
  const changedPhotos: string[] = [];
  for (const c of relevant) {
    const pending = outbox.get(`${c.store}:${c.id}`);
    pending.onsuccess = () => {
      if (pending.result) return;
      const os = t.objectStore(c.store);
      if (c.data === null) {
        os.delete(c.id);
        if (isPhotoStore(c.store)) {
          t.objectStore(PHOTOS).delete(photoKey(c.store, c.id));
          changedPhotos.push(photoKey(c.store, c.id));
        }
        return;
      }
      const record = JSON.parse(c.data);
      if (!isPhotoStore(c.store)) return void os.put(record);
      // The server's copy is the full record: keep the image apart. A record without one has none.
      const { local, action } = splitPhoto({ ...record, hasPhoto: false });
      os.put(local);
      writePhoto(t, { id: photoKey(c.store, c.id), data: action.kind === 'set' ? action.data : null });
      changedPhotos.push(photoKey(c.store, c.id));
    };
  }
  await done(t);
  changedPhotos.forEach(photoChanged);
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
  const t = db.transaction([...STORES, OUTBOX, PHOTOS], 'readwrite');
  const outbox = t.objectStore(OUTBOX);
  const photos = t.objectStore(PHOTOS).getAll();
  for (const store of STORES) {
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => {
      const byKey = new Map((photos.result as PhotoRow[]).map((p) => [p.id, p.data]));
      for (const v of req.result as Entity[]) {
        const full = isPhotoStore(store) ? joinPhoto(v as Entity & { hasPhoto?: boolean }, byKey.get(photoKey(store, v.id))) : v;
        outbox.put(outboxEntry(store, v.id, full));
      }
    };
  }
  await done(t);
}

export function newId(): string {
  return crypto.randomUUID();
}
