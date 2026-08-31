CREATE TABLE IF NOT EXISTS redeem_codes (
  code TEXT PRIMARY KEY COLLATE NOCASE,
  plan_period TEXT NOT NULL CHECK(plan_period IN ('weekly','monthly','yearly')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled','redeemed')),
  expires_at TEXT,
  used_by TEXT,
  used_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_redeem_codes_status ON redeem_codes(status,expires_at);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_used_by ON redeem_codes(used_by,used_at);
