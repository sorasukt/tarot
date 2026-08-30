CREATE TABLE IF NOT EXISTS stripe_customers (
  user_sub TEXT PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tarot_memberships (
  user_sub TEXT PRIMARY KEY,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_checkout_session_id TEXT,
  plan_period TEXT,
  payment_type TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tarot_memberships_customer ON tarot_memberships(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_tarot_memberships_status ON tarot_memberships(status,current_period_end);

CREATE TABLE IF NOT EXISTS stripe_payments (
  stripe_checkout_session_id TEXT PRIMARY KEY,
  user_sub TEXT,
  kind TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_payment_intent_id TEXT,
  amount INTEGER,
  currency TEXT,
  payment_status TEXT NOT NULL,
  receipt_url TEXT,
  reward_fulfillment_status TEXT NOT NULL DEFAULT 'not_applicable',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stripe_payments_user ON stripe_payments(user_sub,created_at);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_fulfillment ON stripe_payments(kind,reward_fulfillment_status,created_at);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);
