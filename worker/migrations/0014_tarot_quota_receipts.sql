-- Retry receipts: hashes only, including for private readings. Purged after 7 days.
CREATE TABLE IF NOT EXISTS tarot_quota_receipts (
  actor_key TEXT NOT NULL,
  quota_date TEXT NOT NULL,
  request_key TEXT NOT NULL,
  PRIMARY KEY (actor_key, quota_date, request_key)
);
CREATE INDEX IF NOT EXISTS idx_tarot_quota_receipts_date ON tarot_quota_receipts(quota_date);
