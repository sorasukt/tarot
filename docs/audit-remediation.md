# Frontend and API audit remediation

This branch includes the reading/quota fix from PR #21 and the account/timeline navigation from PR #22, then addresses the remaining audit findings. Use this combined PR when reviewing the complete change. No production deployment or retrospective quota refund has been performed.

## Coverage

“Implemented” below means the code path has been changed, not that every browser/device or production-provider scenario has been certified.

| Audit | Implementation |
|---|---|
| B01 | Reading error moved outside hidden step containers; failed request retains cards and exposes retry. |
| B02 | Admin captures the form before awaiting, guards pending submits, restores its button and displays errors. |
| B03–B04 | Stop provider audio before starting fallback; show Stop while speech plays and clean up on completion. |
| B05 | Installation entry uses the current home-tools container. |
| B06 | Daily generation waits for policy acceptance and resumes via an acceptance event. |
| B07–B08 | Exhausted 202 is an explicit retry state; busy cleanup uses finally and daily errors stay outside the closed birth dialog. |
| B09 | Editing immediately invalidates the selected place; sequence/query guards discard stale autocomplete responses. |
| B10 | Timeline and insights use independent request sequences to discard stale filter results. |
| B11 | Keyset pagination uses timestamp + ID, with a load-more control and deterministic ordering. |
| B12 | Authenticated history detail endpoint checks ownership, expiry and tier access; expandable detail renders text safely. |
| B13 | Moving a reading out of the selected category refreshes the filtered list. |
| B14 | SQL timestamps are interpreted as UTC before payment sorting/display. |
| B15 | Automatic payment-portal failure reports in the visible billing panel. |
| B16 | Customer-search and case-save failures display admin notices. |
| B17 | Service-worker activation deletes only obsolete Tarot shell caches. |
| B18 | Pending readings guard submission and make card controls inert. |
| B19 | Birth dialog and mobile menu contain keyboard focus, make outside content inert, support Escape and restore focus. |
| B20 | Account tabs and panels receive matching IDs, controls/label relationships and tabpanel roles. |
| B21 | Unselected cards are disabled when five cards have been selected; deselection re-enables them. |
| B22 | Timeline text can wrap without expanding the flex column; narrow rows can wrap controls. |
| B23 | Precache includes canonical CSS and imports, deduplicates URLs, supports versioned static-asset fallback and always returns a Response offline. |
| B24 | Fortune and advanced-billing dispatch await handlers inside their catch boundary. |
| B25 | Deep reading has an independent entry; basic overviews use burst protection without consuming the deep-reading allowance. |
| B26 | Injected global styles precede page styles; avatar wrapper dimensions follow page breakpoints. |
| B27 | Tarot, deep astrology and TTS retain burst limits but commit daily allowance after success. Hashed receipts deduplicate same-day retries; deep-reading receipts include profile identity. |
| B28 | Pending subscription changes preserve the old local plan; a completed change must match the requested effective provider price before DB update. |
| B29 | Plan changes use an operation UUID, reused only on retries of that operation; separate plan-change attempts get separate provider keys. |
| B30 | A manually entered redeem code survives the login redirect in session storage and is removed when restored. Redeem remains absent from the main menu. |
| B31 | Portal pages display a generic login failure and remove auth_error from the URL without reflecting provider error text. |
| B32 | Invoice/payment deduplication preserves refunded, partially-refunded and refund-pending states. |
| B33 | Invalid supplied birth dates reject instead of falling back; explicitly cleared birth time stays cleared in the prompt. |
| B34 | Daily view checks Thai date changes on visibility/pageshow and while an open tab stays visible. |

TTS request byte limits also now accommodate the supported 7,000-character Thai reading instead of rejecting it at approximately 4,000 Thai characters.

## Verification

97 Node tests pass. Added regressions use real SQLite for pagination, detail ownership/expiry, completion-based quotas, concurrent retry deduplication and transaction rollback. Provider mocks verify pending plan changes, per-operation keys and structured API errors. Frontend VM tests cover admin dispatch lifecycle, stale timeline responses, consent/202 handling, preserved card selection, fallback audio and refund rendering. All JavaScript syntax checks pass. All 15 HTML pages pass duplicate-ID and local script/stylesheet-target checks.

## Deployment and remaining checks

Apply migration `0014_tarot_quota_receipts.sql` before deploying the Worker. The existing Worker workflow applies migrations. Deploy frontend changes too: affected script URLs and the service-worker shell version are bumped. Receipts contain hashes only and are purged after seven days alongside daily quota records.

Validate iOS/Safari/PWA installation, offline lifecycle, screen readers and visual layout on actual devices. No real subscription was changed and no real refund was issued; provider outcomes were mocked. These checks do not establish the cause of the reported overnight request failure without production logs. They also do not retrospectively restore previously consumed quota.

Network delivery cannot be guaranteed: a same-day retry of the same operation is not charged twice, but a reload/new card selection is a new operation. Private/guest results may be regenerated instead of persisted. Concurrent generations are possible before the final transactional quota check; the committed daily counter cannot exceed the allowance. Basic astrology overview is protected by the per-minute burst limiter; the daily astrology allowance covers deep readings.

## Delivery follow-up

The post-audit review found that server-side generation success did not establish browser delivery or playable audio. The follow-up replaces generation-based debits with browser acknowledgements, expiring capacity holds and transactional receipts. See [reading-quota-fix.md](reading-quota-fix.md) for the updated behavior, migration 0015, validation and remaining limits. The earlier validation counts and deployment notes above describe the original audit release.
