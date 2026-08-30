CREATE TABLE IF NOT EXISTS member_accounts (
  user_sub TEXT PRIMARY KEY,
  display_name TEXT,
  nickname TEXT,
  email TEXT,
  picture_url TEXT,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_member_accounts_email ON member_accounts(email);
