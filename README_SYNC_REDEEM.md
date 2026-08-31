# Stripe Redeem Sync

Existing Stripe Promotion Codes can be synced into the local Redeem system from Admin. The sync route validates that the Stripe code is active, not expired, and not already redeemed in Stripe before inserting it into D1. Redeem links use the Tarot base path `/tarot/redeem/`.
