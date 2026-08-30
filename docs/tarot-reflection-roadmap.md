# Tarot Reflection Roadmap

This roadmap turns Tarot from a one-off reading into a privacy-conscious reflection experience that gives people useful reasons to return.

## Product principles

- Reflection before prediction: explain patterns without claiming certainty about the future.
- Private by default: questions, notes, and reading history are sensitive user content.
- No dark patterns: streaks and reminders must not shame users for missing a day.
- Reuse existing results before calling AI again whenever possible.
- Thailand time (`Asia/Bangkok`) is the canonical boundary for daily/weekly/monthly experiences.
- Private Mode must avoid storing the question, generated reading, journal note, and derived history entry beyond what is technically required to complete the request.

## Phase 1 — History & reflection foundation

### Tarot Timeline

A chronological history of saved readings. Each entry should contain the reading date, selected cards, optional user-selected category, and a short preview. Users can filter by 30 days, 90 days, or all retained history.

Free accounts receive 30-day history. Active Member accounts receive 90-day history. Annual members receive up to 1 year, subject to the service retention policy. Do not silently extend backend retention only to satisfy the UI; legal/privacy retention rules remain authoritative.

### Recurring Card Insight

Calculate repeated cards from stored history without an AI request. Example: “The Hermit appeared 4 times this month.” Only after the user opens the insight may AI optionally summarize the shared themes from already-saved readings.

The feature must distinguish frequency from prediction and should never claim that repeated cards guarantee an event.

### Reading Collections

Allow a saved reading to be tagged into simple categories such as Work, Love, Study, Money, Personal, and Other. Category is user-controlled and editable.

## Phase 2 — Journal & weekly reflection

### Card of the Day Journal

After a daily card or reading, users may add a short private reflection. Journal entry creation is opt-in. Users can edit or delete their own entry.

### Mood Before / After

Optional lightweight mood selection before and after a reading. This is reflection data, not a mental-health assessment. Avoid clinical labels, scores, diagnosis, or claims that Tarot improved a user's health.

### Weekly Reflection

Once per Thailand-calendar week, signed-in users can request a summary based on their saved cards and journal entries. The summary should identify themes, questions, and changes in the user's own notes without creating new predictions.

Free: basic deterministic weekly stats. Member: AI reflection summary. Annual: longer reflection plus comparison with the previous week.

## Phase 3 — Member experience

### Ask Follow-up

Allow follow-up questions against the existing reading context instead of generating a completely new reading. Suggested entitlement: Member 3 follow-ups per saved reading; Annual 8. Follow-ups consume a separate daily quota to keep cost predictable.

### Voice Reading Modes

Expose user-friendly narration styles rather than Gemini voice names:

- Calm
- Warm
- Clear
- Reflective

The backend maps styles to approved TTS voice/prompt combinations and retains model/voice fallback internally.

### Monthly Tarot Recap

Member: monthly card frequency, categories, and notable journal themes. Annual: AI-assisted month-over-month reflection and a richer recap. Generate on demand and cache the result for the Thailand calendar month.

## Phase 4 — Sharing & control

### Share Card

Create a privacy-safe share image from only the fields explicitly selected by the user. Never include the original question, account identity, birth data, journal text, or hidden metadata unless the user deliberately selects it.

### Private Mode

A visible switch before starting a reading. Private Mode should not create timeline/history/journal records and should bypass persistent AI-result caching where feasible. Usage/rate-limit accounting may retain only the minimum non-content metadata required for abuse prevention.

### Save for Later

Allow a user to bookmark a saved reading for future reflection. This is not a notification by default.

## Entitlement proposal

| Capability | Guest | Free account | Member | Annual |
| --- | --- | --- | --- | --- |
| Tarot Timeline | — | 30 days | 90 days | up to 1 year* |
| Recurring Card stats | — | Yes | Yes | Yes |
| Journal | — | Yes | Yes | Yes |
| Weekly stats | — | Yes | Yes | Yes |
| AI Weekly Reflection | — | — | Yes | Enhanced |
| Follow-up questions | — | — | 3 / reading | 8 / reading |
| Voice modes | — | — | Yes | Yes |
| Monthly recap | — | — | Yes | Enhanced |
| Private Mode | Yes | Yes | Yes | Yes |
| Share Card | Yes | Yes | Yes | Yes |

\* Never exceeds the authoritative privacy/data-retention policy.

## Recommended implementation order

1. Add reading-history storage/API with explicit deletion and Private Mode handling.
2. Build Tarot Timeline from deterministic data.
3. Add recurring-card aggregation without AI.
4. Add journal and user-controlled categories.
5. Add weekly deterministic stats, then member AI reflection.
6. Add follow-up context and a dedicated quota.
7. Add TTS narration styles on top of the existing TTS endpoint.
8. Add monthly recap and privacy-safe sharing.

## Acceptance requirements

- Every stored reflection/history item can be deleted by its owner.
- Server-side authorization is required for every history/journal endpoint.
- Private Mode does not persist reading content.
- Recurring-card counts are computed deterministically.
- AI summaries use existing saved content and clearly frame output as reflection rather than certainty.
- All calendar boundaries use `Asia/Bangkok`.
- Entitlements are enforced server-side, not only by hiding frontend controls.
- Tests cover guest/free/member/annual access, deletion, ownership isolation, Private Mode, and Thailand date boundaries.
