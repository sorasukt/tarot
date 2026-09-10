CREATE TABLE IF NOT EXISTS tarot_reflections (
  history_id TEXT PRIMARY KEY,
  user_sub TEXT NOT NULL,
  note TEXT,
  mood_before TEXT,
  mood_after TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (history_id) REFERENCES tarot_reading_history(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tarot_reflections_user_updated
  ON tarot_reflections(user_sub, updated_at DESC);

CREATE TABLE IF NOT EXISTS tarot_weekly_reflections (
  user_sub TEXT NOT NULL,
  week_start TEXT NOT NULL,
  tier TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_sub, week_start)
);

