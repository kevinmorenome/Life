import { describe, expect, it } from 'vitest';
import { d1Store, insertIfMissingStatement, upsertStatement } from './records';

// The worker's typecheck has no Node types, so SQLite is loaded by name and given the little type used here.
interface Sqlite {
  exec(sql: string): void;
  prepare(sql: string): { run(...args: unknown[]): unknown; all(): unknown[] };
  close(): void;
}
const sqliteModule = 'node:sqlite';
const { DatabaseSync } = (await import(/* @vite-ignore */ sqliteModule)) as { DatabaseSync: new (path: string) => Sqlite };

/** Just enough of D1 on top of an in-memory SQLite, to run the real SQL. */
function fakeDb() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE records (store TEXT NOT NULL, id TEXT NOT NULL, data TEXT, client_updated_at INTEGER NOT NULL, server_seq INTEGER NOT NULL, PRIMARY KEY (store, id))`);
  const db = {
    prepare: (query: string) => ({ bind: (...args: unknown[]) => ({ run: async () => void sql.prepare(query).run(...args) }) }),
  } as unknown as D1Database;
  const rows = () => sql.prepare('SELECT store, id, data, client_updated_at AS at, server_seq AS seq FROM records ORDER BY id').all() as { id: string; data: string | null; at: number; seq: number }[];
  return { db, sql, rows };
}

const run = (stmt: D1PreparedStatement, ...args: unknown[]) => (stmt.bind(...args) as unknown as { run(): Promise<void> }).run();

describe('insertIfMissingStatement', () => {
  it('inserts a new record with the next sequence number', async () => {
    const { db, rows } = fakeDb();
    const stmt = insertIfMissingStatement(db);
    await run(stmt, 'watched', 'a', '{"x":1}', 100);
    await run(stmt, 'watched', 'b', '{"x":2}', 100);
    expect(rows().map((r) => [r.id, r.seq])).toEqual([['a', 1], ['b', 2]]);
  });

  it('leaves an existing record alone, without taking a new sequence number', async () => {
    const { db, rows } = fakeDb();
    const stmt = insertIfMissingStatement(db);
    await run(stmt, 'watched', 'a', '{"x":1}', 100);
    await run(stmt, 'watched', 'a', '{"x":"again"}', 500);
    expect(rows()).toMatchObject([{ id: 'a', data: '{"x":1}', at: 100, seq: 1 }]);
  });

  it('does not bring back a record the user deleted', async () => {
    const { db, sql, rows } = fakeDb();
    await run(insertIfMissingStatement(db), 'watched', 'a', '{"x":1}', 100);
    // What the app's sync does for a deletion: the row stays, with no data.
    await run(upsertStatement(db), 'watched', 'a', null, 200);
    expect(rows()[0].data).toBeNull();
    await run(insertIfMissingStatement(db), 'watched', 'a', '{"x":1}', 900);
    expect(rows()).toMatchObject([{ id: 'a', data: null, at: 200 }]);
    // Whereas the ordinary upsert would have undone the deletion.
    await run(upsertStatement(db), 'watched', 'a', '{"x":1}', 900);
    expect(rows()[0].data).toBe('{"x":1}');
    sql.close();
  });
});

describe('d1Store.list', () => {
  // The real SELECT, on SQLite: field names such as a ride's `from` are SQL keywords.
  function storeOn(sql: Sqlite) {
    const db = {
      prepare: (query: string) => ({ bind: (...args: unknown[]) => ({ all: async () => ({ results: (sql as unknown as { prepare(q: string): { all(...a: unknown[]): unknown[] } }).prepare(query).all(...args) }) }) }),
    } as unknown as D1Database;
    return d1Store(db);
  }
  const insert = (sql: Sqlite, store: string, id: string, data: object) =>
    sql.prepare('INSERT INTO records (store, id, data, client_updated_at, server_seq) VALUES (?, ?, ?, 1, 1)').run(store, id, JSON.stringify(data));

  it('lists rides, whose fields include the keyword `from`', async () => {
    const { sql } = fakeDb();
    insert(sql, 'rides', 'ride-bolt-1', { provider: 'bolt', date: '2026-05-03', from: 'Ilica 1', to: 'Airport', fare: 7.4, currency: 'EUR' });
    insert(sql, 'rides', 'ride-uber-2', { provider: 'uber', date: '2026-05-04', fare: 9 });
    expect(await storeOn(sql).list('rides')).toEqual([
      { id: 'ride-bolt-1', provider: 'bolt', date: '2026-05-03', from: 'Ilica 1', to: 'Airport', fare: 7.4, currency: 'EUR' },
      { id: 'ride-uber-2', provider: 'uber', date: '2026-05-04', fare: 9 },
    ]);
  });

  it('still lists the other stores, with their JSON fields parsed', async () => {
    const { sql } = fakeDb();
    insert(sql, 'clothes', 'c1', { name: 'Shirt', tags: ['a'], wears: ['2026-01-01'] });
    insert(sql, 'foodproducts', 'fp-1', { name: 'Milk', photo: 'data:x' });
    expect(await storeOn(sql).list('clothes')).toEqual([{ id: 'c1', name: 'Shirt', tags: ['a'], wears: ['2026-01-01'] }]);
    expect(await storeOn(sql).list('foodproducts')).toEqual([{ id: 'fp-1', name: 'Milk', hasPhoto: 1 }]);
  });
});
