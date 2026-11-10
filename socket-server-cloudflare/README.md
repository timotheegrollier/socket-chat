# Socket Chat — Cloudflare Worker (API + realtime server)

Cloudflare Worker hosting the static React build (`ASSETS` binding), the REST
API and the Socket.IO-compatible realtime server. The API and socket state share
a single **Durable Object** (`ChatRoom`) backed by its SQLite database.

**Production:** https://socket-chat.sitizstorm.workers.dev

## How it works

- `GET /health` → `{ status, version, timestamp }` (version comes from the
  `VERSION` variable in `wrangler.toml`).
- `POST /api/images` uploads a multipart `image` field to GitHub through the
  Contents API and returns `{ imageUrl }`. The token is read from the
  `GITHUB_TOKEN` secret and never reaches the client.
- Every other `/api/*` request is forwarded to the `tchat` Durable Object, where
  `src/api.ts` serves users, channels and messages on top of the DO's SQLite
  storage (`users`, `channels`, `messages` tables, created on demand).
- Account settings use `Authorization: Bearer <JWT>`:
  `GET /api/secure/me`, `PUT /api/secure/account` (pseudo) and
  `PUT /api/secure/password` (current password + confirmation). The Worker
  verifies the HS256 signature and the expiry before trusting the token.
- `/socket.io/*` with `Upgrade: websocket` is forwarded to the same Durable
  Object, which keeps the socket state in memory.
- Every other request is served from `../client/build` through the `ASSETS`
  binding, with an SPA fallback to `index.html`.
- Origin checking is enforced against `ALLOWED_ORIGINS` in `src/index.ts` — add
  any new frontend domain there before deploying.

### Configuration

Non-secret variables in `wrangler.toml`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VERSION` | `2.3.0` | Returned by `/health` |
| `GITHUB_REPO_OWNER` | `timotheegrollier` | Repository that stores uploaded images |
| `GITHUB_REPO_NAME` | `socket-chat` | Repository that stores uploaded images |
| `GITHUB_BRANCH` | `images` | Dedicated branch that receives uploads (keeps `master` protected and avoids deploy runs per image) |
| `GITHUB_IMAGES_PATH` | `images` | Directory that receives uploads |

Secrets (set with `wrangler secret put` or by the deploy workflow):

| Secret | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | GitHub token with `contents:write`; required for image uploads (returns `503` otherwise) |
| `JWT_SECRET` | Optional JWT signing secret (a development fallback is used when unset) |

For local development, put them in `.dev.vars`:

```dotenv
GITHUB_TOKEN=ghp_your_token_here
JWT_SECRET=change-me
```

### Protocol subset

Engine.IO v4 / Socket.IO v4 framing:

- `0{...}` open, `40` namespace connect, `2`/`3` ping/pong (server-pings),
  `42["event", payload]` events, `45<n>-...` binary events.
- Client → server events: `join`, `newMsg`, `resetTchat`, `typing`, `stopTyping`,
  `join-room`, `offer`, `answer`, `ice-candidate`, `relay-data`.
- Server → client events: `count`, `presence`, `newMsg`, `reset`,
  `refreshCount`, `typing`, `stopTyping`, `room-users`, `user-joined`,
  `user-left`, `relay-data`.
- `join` stores the pseudo (max 12 chars) and broadcasts `presence` as an array
  of `{ id, name }`; the list is refreshed on connect and disconnect too.
- `typing` is broadcast to everyone except the sender; its payload accepts
  either a string or `{ name }`.

## Local development

```bash
npm install
npx wrangler dev --port 8787
```

The static assets directory must exist (`../client/build`). Build the client
first, or create a placeholder `index.html` for socket-only work.

## Tests

```bash
npm run typecheck

# in another terminal
npx wrangler dev --port 8787

SOCKET_URL=http://127.0.0.1:8787 npm run test:protocol
API_URL=http://127.0.0.1:8787 npm run test:api
```

Against production:

```bash
ORIGIN=https://socket-chat.sitizstorm.workers.dev \
SOCKET_URL=https://socket-chat.sitizstorm.workers.dev \
npm run test:protocol

API_URL=https://socket-chat.sitizstorm.workers.dev npm run test:api
```

## Deployment

Deployment is automated: merging a pull request into `master` runs the GitHub
Actions **Deploy** workflow, which builds the client, deploys this Worker with
`cloudflare/wrangler-action`, and pushes the `GITHUB_TOKEN` secret from the
`GITHUB_IMAGES_TOKEN` repository secret.

Manual deploy:

```bash
cd client && npm ci && npm run build
cd ../socket-server-cloudflare && npx wrangler deploy
```

Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and
`GH_IMAGES_TOKEN` (GitHub token with `contents:write`).
