# Reading failure and retry fix

User report: the loading screen disappeared, the card selector returned without a reading, and a daily allowance had been consumed.

The existing frontend exposed the deck after an API error but rendered its error inside a hidden result section. The API debited the daily allowance before validation and provider generation; automatic timeout retries debited it again.

This change moves the error outside the hidden steps, keeps the selected cards and operation ID for retries, and prevents card changes or duplicate submits during generation. Tarot burst limiting remains active. Daily allowance is checked before generation and committed transactionally only after a successful five-card response. A receipt prevents the same request from being charged twice, including when the first response was lost. The entire request is hashed, so changing a question or cards cannot reuse that receipt. Receipts contain no question or reading text and expire with quota records after seven days.

Deployment: apply migration `0014_tarot_quota_receipts.sql` before deploying the Worker. The existing Worker deployment workflow applies migrations. Publish the updated reading HTML and app.js as well; its asset URL is versioned. Deploying only the frontend does not correct accounting.

Validation: 85 Node tests pass, including real SQLite transactions for failed generation, duplicate and overlapping retries, the last available slot, and rollback after receipt failure; frontend VM tests cover pending interaction guards, preserved cards/request ID and error visibility.

Limits: receipt reuse applies to the same actor and Thai calendar day. A reload/new reading creates a new operation. Provider calls can overlap before completion; the final transactional check prevents quota overspending. Guest/private retry responses may be regenerated because this change does not persist their reading content. No real user account, production provider failure, or affected user's overnight request was reproduced. Previously consumed quota is not automatically refunded; identifying affected records requires production evidence. This change does not claim that client delivery can be guaranteed across a disconnected network.
