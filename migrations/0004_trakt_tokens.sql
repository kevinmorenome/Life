-- Trakt access tokens expire (and are renewed with a refresh token), unlike Swarm's.
ALTER TABLE integrations ADD COLUMN refresh_token TEXT;
-- Epoch seconds when the access token stops working.
ALTER TABLE integrations ADD COLUMN expires_at INTEGER;
