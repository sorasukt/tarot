CREATE TABLE IF NOT EXISTS tarot_reading_history (
  id TEXT PRIMARY KEY,
  user_sub TEXT NOT NULL,
  request_key TEXT NOT NULL,
  question TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'personal',
  cards_json TEXT NOT NULL,
  preview TEXT NOT NULL,
  reading_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  UNIQUE(user_sub, request_key)
);

CREATE INDEX IF NOT EXISTS idx_tarot_history_user_created
  ON tarot_reading_history(user_sub, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tarot_history_user_category
  ON tarot_reading_history(user_sub, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tarot_history_expires
  ON tarot_reading_history(expires_at);
