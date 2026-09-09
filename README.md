# sorasukt Tarot

Standalone source for the Tarot experience published at <https://sorasukt.com/tarot/>.

## Repository layout

- Frontend files are stored at the repository root for GitHub Pages.
- `worker/` contains the Cloudflare Worker, D1 migrations, and tests.
- `docs/` contains product and implementation notes.
- `.github/workflows/` contains frontend and Worker validation/deployment workflows.

## UX/UI standard

Use [the shared UX/UI standard](docs/ux-ui-standard.md) for frontend design and review. It sets WCAG 2.2 AA as the accessibility target, defines Tarot-specific visual and interaction rules, and includes acceptance criteria. It does not certify the current site as compliant.

## Local checks

```bash
cd worker
npm install
npm run check
```

Secrets are configured in GitHub and Cloudflare; no secret values belong in this repository.
