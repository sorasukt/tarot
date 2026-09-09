-- Delivery acknowledgements contain opaque tokens and request hashes, never reading text/audio.
CREATE TABLE IF NOT EXISTS quota_deliveries (
  token TEXT PRIMARY KEY,
  actor_key TEXT NOT NULL,
  quota_date TEXT NOT NULL,
  request_key TEXT NOT NULL,
  feature TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE(actor_key, quota_date, request_key)
);
CREATE INDEX IF NOT EXISTS idx_quota_deliveries_expiry ON quota_deliveries(expires_at);
