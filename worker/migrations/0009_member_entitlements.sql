CREATE TABLE IF NOT EXISTS ai_daily_quotas (
  actor_key TEXT NOT NULL,
  quota_date TEXT NOT NULL,
  feature TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (actor_key, quota_date, feature)
);

CREATE INDEX IF NOT EXISTS idx_ai_daily_quotas_date ON ai_daily_quotas(quota_date);
