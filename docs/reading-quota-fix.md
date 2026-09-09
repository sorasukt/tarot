# Quota accounting after delivery

The original loading/error issue was addressed by keeping the selected cards and request ID for retries and showing errors outside hidden sections. Follow-up inspection confirmed another gap: the Worker still charged before the browser received/rendered the result, and TTS was charged before playback could fail.

## Accounting rules

Tarot and deep astrology now return an opaque delivery token only for validated, non-empty results. The browser acknowledges after rendering and two animation frames on a visible page. TTS acknowledges only after successful playback ends, including playback in a background tab. Download failure, decoding failure, autoplay rejection, device fallback and Stop do not acknowledge success. Failed rendering returns to the same selected cards.

The acknowledgement endpoint verifies the current policy, origin and actor ownership. Its D1 transaction increments the original Thai day's counter and inserts the hashed request receipt together. Duplicate acknowledgements, overlapping retries, and retries after an acknowledgement response is lost cannot increment twice. Receipt insertion failure rolls back the increment. An acknowledgement outage never hides an already displayed reading.

Generating a result, losing the response, or abandoning a page does not debit daily usage. An unacknowledged result temporarily holds capacity: two minutes for text, fifteen minutes for audio. Known client failures release the hold early. Expiration releases capacity without charging. The same request can retry through its own hold; other requests receive `DELIVERY_PENDING` if all remaining slots are held. Capacity checks at generation completion prevent concurrently returned distinct results from over-reserving the allowance. Existing burst limits still apply to provider attempts; they are separate from daily usage.

Only request hashes, actor/day/feature, random tokens and expiry are stored by this protocol. No additional question, result or audio content is persisted. Expired delivery tokens are purged by the existing scheduled cleanup; receipts and usage counters retain their seven-day cleanup policy.

## Deployment and verification

Apply migration `0015_quota_deliveries.sql` after `0014_tarot_quota_receipts.sql` before deploying the Worker. The existing Worker deployment workflow applies migrations automatically. Publish the matching frontend too; relevant asset URLs and the service-worker cache version are bumped. Old open pages cannot acknowledge and must reload to use the new protocol. This change is separate from PR #24's TTS response-format fix; both can be reviewed independently.

108 Node tests pass. Real SQLite tests cover lost responses, repeated acknowledgements, concurrent capacity holds, rollback, expired/forged/wrong-owner tokens, cancellation, truncated bodies, complete/incomplete readings, TTS failures and original-day accounting. Frontend VM tests cover rendering before confirmation, render failure, acknowledgement network failures, background playback, decoding/autoplay/download failures, and stopping audio. Route tests cover origin, consent and CORS. Modified frontend scripts and all Worker modules pass syntax checks.

## Practical limits

The browser can confirm rendering/playback, not human perception. A disconnected browser cannot acknowledge; this intentionally favors not charging the user. Client acknowledgements are not tamper-proof: a modified client could suppress or falsely reject them. Temporary capacity holds and server burst limits bound concurrent attempts but cannot prove human receipt. Deliberate Stop is also free under the complete-playback rule.

No live Gemini request, production account change or retrospective refund was performed. A previous charge for an already acknowledged result is not removed when a later retry fails. Guest/private retry content may be regenerated because it is not persisted. Identifying and restoring allowances lost before this change requires production evidence.
