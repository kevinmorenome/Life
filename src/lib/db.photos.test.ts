import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const img = 'data:image/webp;base64,' + 'A'.repeat(200);

async function fresh() {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  return import('./db');
}
type Item = { id: string; name: string; photo?: string; hasPhoto?: boolean };
const pushed = async (db: Awaited<ReturnType<typeof fresh>>, id: string) =>
  JSON.parse((await db.getOutbox()).find((e) => e.key === `clothes:${id}`)!.data!) as Item;

describe('pictures kept apart from records', () => {
  let db: Awaited<ReturnType<typeof fresh>>;
  beforeEach(async () => {
    db = await fresh();
  });

  it('stores the image separately, hands out light records and uploads the full one', async () => {
    const stored = await db.put<Item>('clothes', { id: 'a', name: 'Shirt', photo: img });
    expect(stored).toEqual({ id: 'a', name: 'Shirt', hasPhoto: true });
    expect(await db.getAll<Item>('clothes')).toEqual([{ id: 'a', name: 'Shirt', hasPhoto: true }]);
    expect(await db.getPhoto('clothes', 'a')).toBe(img);
    expect(await pushed(db, 'a')).toEqual({ id: 'a', name: 'Shirt', photo: img });
  });

  it('editing a light record keeps the picture, locally and in what is uploaded', async () => {
    await db.put<Item>('clothes', { id: 'a', name: 'Shirt', photo: img });
    const [light] = await db.getAll<Item>('clothes');
    await db.put('clothes', { ...light, name: 'Blue shirt' });
    expect(await db.getPhoto('clothes', 'a')).toBe(img);
    expect(await pushed(db, 'a')).toEqual({ id: 'a', name: 'Blue shirt', photo: img });
  });

  it('removes the picture when hasPhoto is cleared, and when the record is deleted', async () => {
    await db.put<Item>('clothes', { id: 'a', name: 'Shirt', photo: img });
    const [light] = await db.getAll<Item>('clothes');
    await db.put('clothes', { ...light, hasPhoto: false });
    expect(await db.getPhoto('clothes', 'a')).toBeUndefined();
    expect(await pushed(db, 'a')).toEqual({ id: 'a', name: 'Shirt' });
    await db.put<Item>('clothes', { id: 'b', name: 'Hat', photo: img });
    await db.remove('clothes', 'b');
    expect(await db.getPhoto('clothes', 'b')).toBeUndefined();
  });

  it('splits records pulled from the server and replaces or clears their picture', async () => {
    const change = (data: Item) => ({ store: 'clothes', id: data.id, data: JSON.stringify(data), updatedAt: 1 });
    await db.applyRemote([change({ id: 'a', name: 'Shirt', photo: img })]);
    expect(await db.getAll<Item>('clothes')).toEqual([{ id: 'a', name: 'Shirt', hasPhoto: true }]);
    expect(await db.getPhoto('clothes', 'a')).toBe(img);
    await db.applyRemote([change({ id: 'a', name: 'Shirt' })]);
    expect(await db.getAll<Item>('clothes')).toEqual([{ id: 'a', name: 'Shirt' }]);
    expect(await db.getPhoto('clothes', 'a')).toBeUndefined();
  });

  it('exports full records and restores them split', async () => {
    await db.put<Item>('clothes', { id: 'a', name: 'Shirt', photo: img });
    expect(await db.getAllFull<Item>('clothes')).toEqual([{ id: 'a', name: 'Shirt', photo: img }]);
    await db.replaceAll<Item>('clothes', [{ id: 'z', name: 'Coat', photo: img }]);
    expect(await db.getAll<Item>('clothes')).toEqual([{ id: 'z', name: 'Coat', hasPhoto: true }]);
    expect(await db.getPhoto('clothes', 'a')).toBeUndefined();
    expect(await db.getPhoto('clothes', 'z')).toBe(img);
  });

  it('leaves stores without pictures alone', async () => {
    await db.put('outfits', { id: 'o', photo: img } as never);
    expect(await db.getAll('outfits')).toEqual([{ id: 'o', photo: img }]);
  });

  it('notifies whoever shows a picture when it changes', async () => {
    const seen = vi.fn();
    db.onPhotoChange('clothes', 'a', seen);
    await db.put<Item>('clothes', { id: 'a', name: 'Shirt', photo: img });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('upgrade from the version with embedded pictures', () => {
  it('moves existing pictures into the photos store and keeps the sync cursor', async () => {
    globalThis.indexedDB = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('life', 17);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const s of ['clothes', 'foodproducts', 'outbox', 'meta']) d.createObjectStore(s, { keyPath: s === 'outbox' || s === 'meta' ? 'key' : 'id' });
      };
      req.onsuccess = () => {
        const t = req.result.transaction(['clothes', 'meta'], 'readwrite');
        t.objectStore('clothes').put({ id: 'a', name: 'Shirt', photo: img });
        t.objectStore('clothes').put({ id: 'b', name: 'Hat' });
        t.objectStore('meta').put({ key: 'syncCursor', value: 42 });
        t.oncomplete = () => {
          req.result.close();
          resolve();
        };
        t.onerror = () => reject(t.error);
      };
    });
    vi.resetModules();
    const db = await import('./db');
    expect(await db.getAll<Item>('clothes')).toEqual(expect.arrayContaining([{ id: 'a', name: 'Shirt', hasPhoto: true }, { id: 'b', name: 'Hat' }]));
    expect(await db.getPhoto('clothes', 'a')).toBe(img);
    expect(await db.getMeta('syncCursor')).toBe(42);
  });
});

describe('an upgrade held up by another open copy of the app', () => {
  it('reports it, then carries on once the other copy lets go', async () => {
    globalThis.indexedDB = new IDBFactory();
    // The previous version's connection, which never answers versionchange.
    const held = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('life', 17);
      req.onupgradeneeded = () => {
        for (const s of ['clothes', 'foodproducts', 'outbox', 'meta']) req.result.createObjectStore(s, { keyPath: s === 'outbox' || s === 'meta' ? 'key' : 'id' });
      };
      req.onsuccess = () => resolve(req.result);
    });
    vi.resetModules();
    const db = await import('./db');
    const seen = vi.fn();
    db.onDbProblem(seen);
    const pending = db.getAll('clothes');
    await new Promise((r) => setTimeout(r, 50));
    expect(db.getDbProblem()).toBe('blocked');
    held.close();
    await expect(pending).resolves.toEqual([]);
    expect(db.getDbProblem()).toBeNull();
    expect(seen).toHaveBeenCalledTimes(2);
  });
});
