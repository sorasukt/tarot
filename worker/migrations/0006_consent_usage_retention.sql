CREATE TABLE IF NOT EXISTS member_policy_acceptances (
  user_sub TEXT PRIMARY KEY,
  policy_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  user_sub TEXT,
  anonymous_hash TEXT,
  event_name TEXT NOT NULL,
  feature TEXT NOT NULL,
  page_path TEXT NOT NULL,
  status TEXT,
  duration_ms INTEGER,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL DEFAULT (datetime('now', '+60 days'))
);

CREATE INDEX IF NOT EXISTS idx_usage_events_expiry ON usage_events(expires_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_feature ON usage_events(feature, created_at);

UPDATE member_ai_results
SET expires_at = datetime(created_at, '+60 days')
WHERE expires_at > datetime(created_at, '+60 days');
