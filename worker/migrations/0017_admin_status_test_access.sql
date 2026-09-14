CREATE TABLE IF NOT EXISTS service_status (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'operational'
    CHECK(status IN ('operational','degraded','partial_outage','major_outage','maintenance')),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO service_status(slug,name,description) VALUES
  ('sorasukt-api','sorasukt API','Authentication and shared API gateway'),
  ('tarot','Tarot','Tarot readings, membership and account services'),
  ('pangtang','PangTang','Personal finance and statement import');

CREATE TABLE IF NOT EXISTS status_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  impact TEXT NOT NULL DEFAULT 'minor'
    CHECK(impact IN ('none','minor','major','critical')),
  status TEXT NOT NULL DEFAULT 'investigating'
    CHECK(status IN ('investigating','identified','monitoring','resolved','maintenance')),
  message TEXT NOT NULL,
  affected_services TEXT NOT NULL DEFAULT '[]',
  starts_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_status_incidents_time
  ON status_incidents(starts_at DESC,status);

CREATE TABLE IF NOT EXISTS status_event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  service_slug TEXT,
  incident_id INTEGER,
  status TEXT,
  message TEXT,
  actor_email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_status_event_log_time
  ON status_event_log(created_at DESC);

CREATE TABLE IF NOT EXISTS admin_test_links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  service TEXT NOT NULL CHECK(service IN ('tarot','pangtang')),
  membership INTEGER NOT NULL DEFAULT 0 CHECK(membership IN (0,1)),
  expires_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_test_links_expiry
  ON admin_test_links(expires_at,revoked_at);
