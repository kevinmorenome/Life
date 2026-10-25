-- One row per synced record. `data` is the record as an opaque JSON string
-- (NULL marks a deletion), so the server never needs to know module schemas.
CREATE TABLE records (
  store TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,
  client_updated_at INTEGER NOT NULL,
  server_seq INTEGER NOT NULL,
  PRIMARY KEY (store, id)
);

CREATE INDEX records_server_seq ON records (server_seq);
