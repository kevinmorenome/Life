// Server-side access to the `records` table shared by sync and the MCP endpoint.

/**
 * Upserts one record, keeping the newest edit (last write wins). Each statement
 * takes the next sequence number, so clients pull it on their next sync.
 */
export function upsertStatement(db: D1Database): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO records (store, id, data, client_updated_at, server_seq)
     VALUES (?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(server_seq), 0) + 1 FROM records))
     ON CONFLICT (store, id) DO UPDATE SET
       data = excluded.data,
       client_updated_at = excluded.client_updated_at,
       server_seq = excluded.server_seq
     WHERE excluded.client_updated_at >= records.client_updated_at`,
  );
}

export type Row = { id: string } & Record<string, unknown>;

/** Narrow view of the records the MCP tools need; faked in tests. */
export interface RecordStore {
  list(store: 'clothes' | 'outfits' | 'inbox'): Promise<Row[]>;
  put(store: 'clothes' | 'outfits' | 'inbox', id: string, record: object): Promise<void>;
  /** Photo data URLs of the given items (only those that have one). */
  photos(ids: string[]): Promise<Map<string, string>>;
}

// Records can carry large photo data URLs, so only the fields the tools need
// are extracted in SQL rather than loading whole rows into the Worker.
const FIELDS = {
  clothes: ['name', 'category', 'brand', 'color', 'status', 'tags', 'wears', 'priorWears'],
  outfits: ['name', 'itemIds', 'tags', 'wears', 'priorWears'],
  inbox: ['type', 'date', 'itemIds', 'outfitIds', 'appliedAt', 'error'],
} as const;

const JSON_FIELDS = new Set(['tags', 'wears', 'itemIds', 'outfitIds']);

export function d1Store(db: D1Database): RecordStore {
  return {
    async list(store) {
      const columns = FIELDS[store].map((f) => `json_extract(data, '$.${f}') AS ${f}`).join(', ');
      const { results } = await db
        .prepare(`SELECT id, ${columns} FROM records WHERE store = ?1 AND data IS NOT NULL`)
        .bind(store)
        .all<Row>();
      return results.map((row) => {
        for (const f of JSON_FIELDS) if (typeof row[f] === 'string') row[f] = JSON.parse(row[f] as string);
        for (const f of FIELDS[store]) if (row[f] === null) delete row[f];
        return row;
      });
    },
    async photos(ids) {
      if (ids.length === 0) return new Map();
      const marks = ids.map((_, i) => `?${i + 2}`).join(', ');
      const { results } = await db
        .prepare(`SELECT id, json_extract(data, '$.photo') AS photo FROM records WHERE store = ?1 AND id IN (${marks})`)
        .bind('clothes', ...ids)
        .all<{ id: string; photo: string | null }>();
      return new Map(results.filter((r) => r.photo).map((r) => [r.id, r.photo!]));
    },
    async put(store, id, record) {
      await upsertStatement(db).bind(store, id, JSON.stringify(record), Date.now()).run();
    },
  };
}
