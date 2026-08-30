CREATE TABLE IF NOT EXISTS member_ai_results (
  user_sub TEXT NOT NULL,
  feature TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (user_sub, feature, request_hash)
);

CREATE INDEX IF NOT EXISTS idx_member_ai_results_expiry
  ON member_ai_results(expires_at);
