CREATE TABLE IF NOT EXISTS member_profiles (
  user_sub TEXT PRIMARY KEY,
  birth_date TEXT NOT NULL,
  birth_time TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_readings (
  user_sub TEXT NOT NULL,
  reading_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  card_id INTEGER,
  card_name TEXT,
  horoscope_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_sub, reading_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_readings_date ON daily_readings(reading_date);
