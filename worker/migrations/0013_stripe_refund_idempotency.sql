ALTER TABLE stripe_refunds ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stripe_refunds_request_id
ON stripe_refunds(request_id)
WHERE request_id IS NOT NULL;
