# Contributing to Socket Chat

Thanks for taking the time to contribute! This document describes the workflow
used by this repository.

## Branch model

`master` is protected:

- Direct pushes are rejected, force pushes and branch deletion are disabled.
- Every change must go through a **pull request**.
- CI must be green before a pull request can be merged.

Work on a dedicated branch:

```bash
git checkout -b feat/short-description
```

## Pull requests

1. Keep changes focused; one feature or fix per pull request.
2. Fill in the pull request template (summary, type, checklist).
3. Make sure the following pass locally:

   ```bash
   cd client && CI=true npm test -- --watchAll=false && npm run build
   cd socket-server-cloudflare && npm run typecheck
   ```

4. Wait for the CI workflow (`client` + `worker` jobs) to complete.
5. Squash-merge the pull request. Merging triggers the Deploy workflow, which
   publishes to Cloudflare.

No approving review is required (solo maintainer setup), but all status checks
are mandatory.

## Commit messages

Use short, imperative subjects, ideally following Conventional Commits:

```
feat: add typing indicator
fix: keep loading state until socket is ready
docs: document CI/CD pipeline
chore: bump version to 2.1.0
```

## Versioning

The app version is **2.1.0**. Bump it in:

- `package.json`
- `client/package.json` — injected into the build as `REACT_APP_VERSION` and
  displayed on the About page and chat header
- `socket-server-cloudflare/package.json`
- `socket-server-cloudflare/wrangler.toml` — `VERSION` variable exposed by
  `/health`

Then refresh the lockfiles:

```bash
npm install --package-lock-only
cd client && npm install --package-lock-only
cd ../socket-server-cloudflare && npm install --package-lock-only
```

## Environment configuration

- The API expects `DBUSER` (and optionally `PORT`, `SSL_PORT`) in `.env`.
- `client/src/config.json` is ignored by git; start from
  `client/src/config.example.json`.
- CI generates `config.json` from the repository variables `API_URL` and
  `SOCKET_URL` (with production fallbacks).

## Cloudflare deployment secrets

Set in **Settings → Secrets and variables → Actions**:

| Secret / variable | Required | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | yes | Wrangler deployment token (Workers Scripts: Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | yes | Cloudflare account id |
| `API_URL` | no | Overrides the REST API URL baked into the client |
| `SOCKET_URL` | no | Overrides the socket URL baked into the client |

Without the secrets the Deploy workflow skips the Cloudflare step and emits a
warning annotation.

## Security

Do not commit secrets, `.env` files, API tokens, or production certificates.
`RANDOM_TOKEN_SECRET` in the API is a development placeholder and must be
replaced before any real deployment.
