// Tiny IndexedDB wrapper. Every feature module gets its own object store,
// keyed by `id`. To add a store: append it to STORES and bump DB_VERSION.

export const STORES = ['clothes'] as const;
export type StoreName = (typeof STORES)[number];

const DB_NAME = 'life';
const DB_VERSION = 1;

export interface Entity {
  id: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb();
  return db.transaction(store, mode).objectStore(store);
}

export async function getAll<T extends Entity>(store: StoreName): Promise<T[]> {
  return request((await tx(store, 'readonly')).getAll()) as Promise<T[]>;
}

export async function put<T extends Entity>(store: StoreName, value: T): Promise<void> {
  await request((await tx(store, 'readwrite')).put(value));
}

export async function remove(store: StoreName, id: string): Promise<void> {
  await request((await tx(store, 'readwrite')).delete(id));
}

/** Replaces the entire contents of a store in one transaction. */
export async function replaceAll<T extends Entity>(store: StoreName, values: T[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    os.clear();
    for (const v of values) os.put(v);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export function newId(): string {
  return crypto.randomUUID();
}
