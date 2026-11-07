-- Server-side credentials for outside services (Swarm). Kept out of `records` on purpose:
-- that table is synced to every client, and an access token must never reach one.
CREATE TABLE integrations (
  name TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  -- createdAt (epoch seconds) of the newest item fetched so far
  cursor INTEGER NOT NULL DEFAULT 0,
  last_sync INTEGER
);
