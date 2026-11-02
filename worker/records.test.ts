import { describe, expect, it } from 'vitest';
import { insertIfMissingStatement, upsertStatement } from './records';

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
