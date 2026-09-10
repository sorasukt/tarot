# sorasukt Tarot

Standalone source for the Tarot experience published at <https://sorasukt.com/tarot/>.

## Repository layout

- Frontend files are stored at the repository root for GitHub Pages.
- `worker/` contains the Cloudflare Worker, D1 migrations, and tests.
- `docs/` contains product and implementation notes.
- `.github/workflows/` contains frontend and Worker validation/deployment workflows.

## UX/UI standard

Use [the shared UX/UI standard](docs/ux-ui-standard.md) for frontend design and review. It sets WCAG 2.2 AA as the accessibility target, defines Tarot-specific visual and interaction rules, and includes acceptance criteria. It does not certify the current site as compliant.

## Product roadmap

The detailed scope and privacy rules live in [Tarot Reflection Roadmap](docs/tarot-reflection-roadmap.md).

| Phase | Focus | Status |
| --- | --- | --- |
| 1 | Timeline, recurring-card insights, and reading categories | Implemented |
| 2 | Private journal, optional mood before/after, and weekly reflection | In progress |
| 3 | Follow-up questions, voice modes, and monthly recap | Planned; membership, limits, and base TTS already exist |
| 4 | Privacy-safe sharing, Private Mode, and Save for Later | Partially implemented; Private Mode exists |

All calendar boundaries use `Asia/Bangkok`. Reflection features must remain optional, owner-authorized, deletable, and unavailable for persistently storing Private Mode readings.

## Local checks

```bash
cd worker
npm install
npm run check
```

Secrets are configured in GitHub and Cloudflare; no secret values belong in this repository.
