# Socket Chat — Cloudflare Worker (realtime server)

Cloudflare Worker hosting both the static React build (`ASSETS` binding) and the
Socket.IO-compatible realtime server, implemented on top of a single **Durable
Object** (`ChatRoom`).

**Production:** https://socket-chat.sitizstorm.workers.dev

## How it works

- `GET /health` → `{ status, version, timestamp }` (version comes from the
  `VERSION` variable in `wrangler.toml`).
- `GET /socket.io/*` with `Upgrade: websocket` is forwarded to one Durable
  Object named `tchat`, which keeps the socket state in memory.
- Every other request is served from `../client/build` through the `ASSETS`
  binding, with an SPA fallback to `index.html`.
- Origin checking is enforced against `ALLOWED_ORIGINS` in `src/index.ts` — add
  any new frontend domain there before deploying.

### Protocol subset

Engine.IO v4 / Socket.IO v4 framing:

- `0{...}` open, `40` namespace connect, `2`/`3` ping/pong (server-pings),
  `42["event", payload]` events, `45<n>-...` binary events.
- Client → server events: `newMsg`, `resetTchat`, `typing`, `stopTyping`,
  `join-room`, `offer`, `answer`, `ice-candidate`, `relay-data`.
- Server → client events: `count`, `newMsg`, `reset`, `refreshCount`, `typing`,
  `stopTyping`, `room-users`, `user-joined`, `user-left`, `relay-data`.
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
```

Against production:

```bash
ORIGIN=https://socket-chat.sitizstorm.workers.dev \
SOCKET_URL=https://socket-chat.sitizstorm.workers.dev \
npm run test:protocol
```

## Deployment

Deployment is automated: merging a pull request into `master` runs the GitHub
Actions **Deploy** workflow, which builds the client and deploys this Worker with
`cloudflare/wrangler-action`.

Manual deploy:

```bash
cd client && npm ci && npm run build
cd ../socket-server-cloudflare && npx wrangler deploy
```

Required GitHub secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
