# sorasukt Tarot

Standalone source for the Tarot experience published at <https://sorasukt.com/tarot/>.

## Repository layout

- Frontend files are stored at the repository root for GitHub Pages.
- `worker/` contains the Cloudflare Worker, D1 migrations, and tests.
- `docs/` contains product and implementation notes.
- `.github/workflows/` contains frontend and Worker validation/deployment workflows.

## Local checks

```bash
cd worker
npm install
npm run check
```

Secrets are configured in GitHub and Cloudflare; no secret values belong in this repository.
