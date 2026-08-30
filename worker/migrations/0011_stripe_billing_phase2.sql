CREATE TABLE IF NOT EXISTS stripe_refunds (
  stripe_refund_id TEXT PRIMARY KEY,
  stripe_payment_intent_id TEXT NOT NULL,
  stripe_checkout_session_id TEXT,
  user_sub TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'thb',
  status TEXT NOT NULL,
  reason TEXT,
  admin_sub TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stripe_refunds_payment_intent ON stripe_refunds(stripe_payment_intent_id,created_at);
CREATE INDEX IF NOT EXISTS idx_stripe_refunds_user ON stripe_refunds(user_sub,created_at);

CREATE TABLE IF NOT EXISTS stripe_billing_recovery (
  user_sub TEXT PRIMARY KEY,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_invoice_id TEXT,
  state TEXT NOT NULL DEFAULT 'ok',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_payment_attempt TEXT,
  hosted_invoice_url TEXT,
  last_failed_at TEXT,
  recovered_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stripe_billing_recovery_state ON stripe_billing_recovery(state,updated_at);
