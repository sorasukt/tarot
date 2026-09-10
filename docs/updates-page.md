# Website updates

`/tarot/updates/` uses the public GitHub REST pull-request feed for `sorasukt/tarot`.
It requires no browser token or additional server configuration. The public repository
must remain accessible. Titles link to their source PR; bodies are not copied.

- Latest updates: closed PRs with a non-null `merged_at`, sorted by merge time within loaded data.
- Future updates: open PRs, including drafts marked as such. This is not a release commitment.
- Closed-unmerged PRs are omitted. Merged does not imply deployed; the page says so.
- Each section loads 100 source records at a time, follows the `next` relation through a Load more button,
  deduplicates PR numbers and re-sorts. Closed-unmerged records may leave an empty page with more data.
- Each request has a 12-second timeout. Errors and rate limits preserve prior entries and offer retry.
- All source titles use textContent; links are constructed from validated PR numbers on a fixed host.
- No private token, local storage, or stale success cache is used. Offline/blocked GitHub shows an error,
  with a GitHub link in the no-JavaScript fallback. The service worker caches page assets, not API data.

Reading layout uses `core/design-system.css`, `core/transitions.css`, the shared
`components/actions.css` and page-specific `pages/reading.css`. Question/category/private
input IDs, retry identity, delivery acknowledgements and TTS are retained. The secondary
category/privacy options are in native details, keyboard-operable without custom scripting.

Validation: 120 Node tests, including feed classification/pagination/rate limit/abort cases.
Real browser/device visual and keyboard verification remains outstanding in this environment.
