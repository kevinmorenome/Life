-- Swarm's first fetches only ever read the newest page (the API ignores sort/afterTimestamp), so existing
-- connections must walk their whole history once, with `offset`. 0 until that has finished.
ALTER TABLE integrations ADD COLUMN history_done INTEGER NOT NULL DEFAULT 0;
