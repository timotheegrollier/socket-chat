# Socket Chat

[![CI](https://github.com/timotheegrollier/socket-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/timotheegrollier/socket-chat/actions/workflows/ci.yml)
[![Deploy](https://github.com/timotheegrollier/socket-chat/actions/workflows/deploy.yml/badge.svg)](https://github.com/timotheegrollier/socket-chat/actions/workflows/deploy.yml)

A real-time chat application built as a learning project around WebSockets.
Version **2.2.9** redesigns the desktop experience as a proper chat workspace:
a framed app shell, a branded sidebar, a channel header with presence, and a
centered message column that scrolls inside the window while the composer stays
anchored at the bottom. It keeps the recent improvements: case-insensitive login
with canonical display names, and Telegram-style PWA ergonomics on phones:
full-screen chat, safe areas and keyboard-aware layout, a compact drawer/composer,
and message bubbles. It also keeps the previous improvements: instant local
loading with background revalidation, whole-message socket delivery, identified
messages, typing indicator, unread notifications, multiple channels, resilient
connections, and a pseudo that stays attached to every message.

**Live:** https://timotheegrollier.github.io/socket-chat/

The static frontend is hosted on **GitHub Pages**; the realtime socket layer
and the REST API both run on **Cloudflare Workers + Durable Objects**.

---

## Features

| Feature | Description |
| --- | --- |
| Real-time messages | Socket.IO protocol over a WebSocket connection, no polling |
| Instant loading | Channels and the last messages are cached per account on the device; a cold start shows them immediately, then revalidates quietly in the background |
| Channels | Create a channel inline from the sidebar, switch instantly, delete it with its history; messages and search are scoped per channel |
| Author & timestamps | Every message carries its author (pseudo), author id and creation date |
| Reliable identity | The pseudo is cached at login, applied before the profile request finishes, and resolved from the account on the server — messages are never stored as Anonymous |
| Typing indicator | `typing` / `stopTyping` events broadcast to everyone else in the room |
| Online presence | A live sidebar lists everyone connected under their pseudo (`join` + `presence` events) |
| Online counter | The Durable Object tracks connected clients and broadcasts `count` |
| Unread badge | The tab title shows `(N) new message(s)` while the page is hidden |
| Connection resilience | Screen lock, app switch or network drop: the status pill switches to Paused/Reconnecting, the socket reconnects immediately on return, missed messages are fetched and your channel is preserved |
| Connection feedback | A compact status pill (Live / Connecting / Reconnecting / Offline / Paused), a contextual banner with a Retry button and a "Back online" toast instead of an alarming error |
| Message tools | Copy any message, delete your own (`DELETE /api/messages/:id`), local search across the conversation |
| Conversation timeline | Consecutive messages from the same author are grouped (5 min window) with day separators |
| Smart scrolling | New messages do not yank the view while you read history; a "New messages" pill jumps back |
| Multi-line composer | Auto-growing textarea — Enter sends, Shift+Enter adds a new line |
| Emoji picker | Quick reactions appended to the composer |
| Toasts | Lightweight feedback for copy, delete, reset and reconnect events |
| Input limits | 500 characters max, live counter, validated on client **and** server |
| Auth | Signup / login with PBKDF2 + JWT (24 h), stored in `localStorage` |
| Chat reset | `/delete` command clears all messages for every connected client |
| Responsive layout | Dark, Discord/Linear-style shell: presence sidebar, channel column, sticky composer, mobile drawer |

---

## Architecture

```
                    ┌──────────────────────────────┐
                    │        React SPA (v2.0)      │
                    │  React 17 · Router · SCSS    │
                    └──────────────┬───────────────┘
                                   │
                 ┌─────────────────┴──────────────────┐
                 │                                    │
        HTTPS (REST API)                 WebSocket /socket.io
                 │                                    │
                 ▼                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │  Cloudflare Worker                                           │
     │  ├─ /api/*  → Durable Object ChatRoom (SQLite: users,        │
     │  │            channels, messages)                            │
     │  ├─ /api/images → GitHub Contents API (token is a secret)    │
     │  └─ /socket.io/* → Durable Object ChatRoom (socket state)    │
     └──────────────────────────────────────────────────────────────┘

        React SPA (GitHub Pages) ── REST + WebSocket ──► Cloudflare Worker
```

- The **React SPA** is built by Create React App and deployed to **GitHub Pages**
  by the `pages.yml` workflow.
- The **Worker** routes `/socket.io/*` upgrades to a single **Durable Object**
  (`ChatRoom`), which implements the Engine.IO / Socket.IO protocol subset used
  by the client. It also keeps a self-contained copy of the static build through
  the `ASSETS` binding as a fallback.
- The **REST API** runs inside the same Worker and stores users, channels and
  messages in the **SQLite database of the `ChatRoom` Durable Object**. No
  external database or additional Cloudflare resource is required.
- **Authentication** uses PBKDF2 password hashing and HS256 JWTs, both through
  the Workers WebCrypto API.
- **GitHub image storage**: images uploaded from the composer are sent to
  `POST /api/images`; the Worker commits them to the repository with the GitHub
  Contents API and returns a `raw.githubusercontent.com` URL. The GitHub token
  stays in a Worker secret and never reaches the browser.
- **GitHub Actions** deploys the frontend to Pages and the Worker (API + socket
  + static assets) to Cloudflare on every push to `master`.

---

## Tech stack

- **Frontend:** React 17 (Create React App), React Router 6, SCSS, Bootstrap 5,
  socket.io-client, Axios
- **Realtime:** Cloudflare Workers + Durable Objects (TypeScript), a custom
  implementation of the Socket.IO packet format (Engine.IO v4)
- **API:** Cloudflare Workers + Durable Objects (SQLite storage), WebCrypto
  (PBKDF2 + HS256 JWT)
- **Tooling:** GitHub Actions (CI/CD), Wrangler 4, node:test-style protocol
  scripts, Testing Library

---

## Repository layout

```
.
├── .github/
│   ├── workflows/
│   │   ├── ci.yml              # tests + build on every PR and push to master
│   │   ├── deploy.yml          # deploy the socket Worker to Cloudflare on master
│   │   └── pages.yml           # build + deploy the frontend to GitHub Pages
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CONTRIBUTING.md
├── client/                     # React application
│   ├── public/
│   └── src/
│       ├── components/         # Nav, Login
│       ├── pages/              # Home (chat), About, Signup
│       └── styles/             # SCSS (chat, about, general, signup)
├── controllers/                # Legacy Express controllers (not deployed)
├── middleware/                 # Legacy Express middleware (not deployed)
├── models/                     # Legacy Mongoose schemas (not deployed)
├── routes/                     # Legacy Express routers (not deployed)
├── app.js                      # Legacy Express app (not deployed)
├── server.js                   # Legacy HTTP/HTTPS dev server (not deployed)
└── socket-server-cloudflare/   # Cloudflare Worker + Durable Object
    ├── src/
    │   ├── index.ts            # Worker entry, socket protocol, DO routing
    │   └── api.ts              # REST API + GitHub image upload
    ├── test/
    │   ├── protocol.test.js    # socket protocol suite
    │   └── api.test.js         # REST API suite
    └── wrangler.toml
```

---

## Getting started

### Prerequisites

- Node.js 20+
- Wrangler (installed locally in `socket-server-cloudflare`)
- Optional: a GitHub token with `contents:write` if you want to test image
  uploads locally
- MongoDB Atlas is only needed to run the legacy Express backend; the production
  stack does not use it.

### 1. Install

```bash
cd client && npm install && cd ..
cd socket-server-cloudflare && npm install && cd ..
```

### 2. Configure the Worker

For local development, create `socket-server-cloudflare/.dev.vars`:

```dotenv
GITHUB_TOKEN=ghp_your_token_here
# Optional: defaults to a development secret.
JWT_SECRET=change-me
```

Image uploads stay disabled (the API returns `503`) when `GITHUB_TOKEN` is
missing, but everything else works. In production the token is stored as a
Worker secret by the deploy workflow; it is never exposed to the client.

Non-secret settings live in `socket-server-cloudflare/wrangler.toml`:
`GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_BRANCH` and
`GITHUB_IMAGES_PATH`.

### 3. Configure the client

`client/src/config.json` is ignored by git (environment-specific). Copy the
template and adjust the URLs:

```bash
cp client/src/config.example.json client/src/config.json
```

```json
{
    "api_url": "https://socket-chat.sitizstorm.workers.dev",
    "socket_url": "https://socket-chat.sitizstorm.workers.dev"
}
```

For local development, point both entries to `http://127.0.0.1:8787`.

### 4. Run

```bash
# Build the frontend, then run the full stack locally (API + socket + assets)
cd client && npm run build && cd ..
cd socket-server-cloudflare && npx wrangler dev --port 8787

# Or, for frontend hot reload against the local Worker
cd client && npm start             # http://localhost:3000
```

The legacy Express API (`npm start` at the repository root) still exists for
historical reference, but it is no longer deployed and no longer used by the
production client.

---

## Socket protocol (Worker)

The client connects with `transports: ['websocket']`. Supported client → server
events:

| Event | Payload | Server behaviour |
| --- | --- | --- |
| `join` | `name: string` or `{ name }` | Registers the pseudo and broadcasts the updated `presence` list |
| `newMsg` | `{ channel, message? }` | Broadcasts `newMsg` `{ channel, message }` to everyone; `message` is the saved message (`_id`, `message`, `author`, `authorId`, `channel`, `createdAt`), clamped by the Worker. A plain `{ channel }` still works and asks clients to refresh |
| `channelsChanged` | — | Broadcasts `channelsChanged` to everyone |
| `channelDeleted` | `{ channel }` | Broadcasts `channelDeleted` `{ channel }` to everyone |
| `resetTchat` | `{ channel }` | Broadcasts `reset` `{ channel }` to everyone |
| `typing` | `{ name, channel }` | Broadcasts `typing` `{ name, channel }` to everyone **except the sender** |
| `stopTyping` | `{ channel }` | Broadcasts `stopTyping` `{ channel }` to everyone except the sender |
| `join-room` | `{ roomId, name }` | Joins a WebRTC signalling room |
| `offer` / `answer` / `ice-candidate` | `{ target, ... }` | Targeted signalling relay |
| `relay-data` | `{ target, data, meta }` | Targeted relay (text or binary) |

Server → client: `count`, `presence`, `newMsg`, `channelsChanged`,
`channelDeleted`, `reset`, `refreshCount`, `typing`, `stopTyping`, `room-users`,
`user-joined`, `user-left`, `relay-data`.

`presence` is an array of `{ id, name }`, recalculated on connect, `join` and
disconnect.

The Worker sends a heartbeat every **25 s** and tolerates **60 s** of silence,
which covers short phone screen locks. When the browser is visible again (or the
network returns), the client immediately opens a fresh socket and re-fetches the
active channel, so messages sent while the page was frozen are not lost.

`GET /health` returns:

```json
{ "status": "ok", "version": "2.2.9", "timestamp": "..." }
```

---

## REST API

The API is implemented by the Worker (`socket-server-cloudflare/src/api.ts`) and
persists data in the SQLite database of the `ChatRoom` Durable Object.

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/api/secure/signup` | Create an account (pseudo, password, confirmPass, terms) |
| `POST` | `/api/secure/login` | Returns `{ userId, pseudo, token }` (JWT, 24 h) |
| `GET` | `/api/secure/:id` | Returns the user (pseudo) |
| `GET` | `/api/channels` | List channels (`general` is always present) |
| `POST` | `/api/channels/new` | Create a channel — `{ name }` (1-24 lowercase letters, numbers or hyphens) |
| `DELETE` | `/api/channels/:name` | Delete a channel and all its messages (`general` is protected) |
| `GET` | `/api/messages?channel=general` | List messages for a channel (`message`, `imageUrl`, `author`, `authorId`, `channel`, `createdAt`) |
| `POST` | `/api/messages/new` | Create a message — `{ message, author, authorId, channel, imageUrl? }`; when `authorId` matches an account, the stored pseudo overrides `author` |
| `DELETE` | `/api/messages/:id` | Delete a message — `{ authorId }` must match the message owner |
| `DELETE` | `/api/messages?channel=general` | Delete all messages in a channel (chat reset) |
| `POST` | `/api/images` | Multipart upload (`image` field, max 8 MB). Commits the file to GitHub and returns `{ imageUrl }`; returns `503` when no token is configured |

---

## Tests

Automated tests run on every pull request and every push to `master`:

```bash
# Client unit tests (Testing Library + Jest via react-scripts)
cd client
CI=true npm test -- --watchAll=false

# Worker typecheck
cd socket-server-cloudflare
npm run typecheck

# Worker protocol tests — requires a local worker on :8787
npx wrangler dev --port 8787 &
SOCKET_URL=http://127.0.0.1:8787 npm run test:protocol

# REST API tests (same local worker)
API_URL=http://127.0.0.1:8787 npm run test:api
```

The protocol suite covers the health endpoint, connection count, `newMsg`,
`channelsChanged`, `channelDeleted`, `reset`, the presence list (`join` /
`presence`), the typing indicator between two clients, and `stopTyping`. The API
suite covers signup validation and duplicate detection, login, profiles,
channels, message CRUD and authorization, CORS preflight, and the image-upload
guard when no GitHub token is configured.

---

## CI / CD and branch protection

- **`master` is protected**: direct pushes are blocked, force pushes and branch
  deletion are disabled, and every change must go through a pull request.
- The **CI** workflow (`ci.yml`) runs on pull requests and on `master`:
  - `client`: install, generate `config.json` from repository variables, unit
    tests, production build.
  - `worker`: install, TypeScript typecheck, start `wrangler dev`, protocol tests
    and REST API tests.
- A pull request can only be merged when both checks are green.
- Merging to `master` triggers two deployments:
  - **Deploy** (`deploy.yml`) deploys the Worker (API + socket + assets) to
    Cloudflare with `cloudflare/wrangler-action`, pushes the `GITHUB_TOKEN`
    Worker secret, then smoke-tests `/health` and `/api/channels`.
  - **Deploy frontend to GitHub Pages** (`pages.yml`) builds the React app and
    publishes `client/build` to GitHub Pages. The repository's Pages source must
    be set to **GitHub Actions**.

### Required repository configuration

| Type | Name | Value |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | API token with *Workers Scripts: Edit* permission |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |
| Secret | `GITHUB_IMAGES_TOKEN` | GitHub token with `contents:write` on this repository, used for image uploads. The workflow stores it in the Worker as `GITHUB_TOKEN` |
| Secret (optional) | `JWT_SECRET` | Overrides the JWT signing secret (a development fallback is used when unset) |
| Variable (optional) | `API_URL` | Overrides the REST API URL baked into the client |
| Variable (optional) | `SOCKET_URL` | Overrides the socket URL baked into the client |

If the Cloudflare secrets are missing, the deploy job is skipped with a warning
annotation instead of failing the pipeline. If `GITHUB_IMAGES_TOKEN` is missing,
the deploy still succeeds but image uploads return `503` until the secret is
added; the workflow emits a warning annotation.

### Image storage configuration

Images are committed to this repository through the GitHub Contents API. The
Worker uploads to `GITHUB_REPO_OWNER/GITHUB_REPO_NAME` on the dedicated
`GITHUB_BRANCH` (default: `images`, created automatically from the default
branch when missing) under `GITHUB_IMAGES_PATH`, and returns a
`raw.githubusercontent.com` URL. The token is read from the `GITHUB_TOKEN`
Worker secret at runtime and is never included in the client bundle. Keeping
uploads on a separate branch leaves `master` protected and avoids running the
deploy workflows for every image.

### Release flow

1. Create a branch, commit your changes and open a pull request against `master`.
2. Wait for CI to pass; request a review or self-merge (no approval required).
3. Squash-merge the pull request.
4. The Deploy workflow updates the Cloudflare Worker, and the Pages workflow
   publishes the frontend to GitHub Pages, both automatically.

---

## Versioning

The current version is **2.2.9**. It is displayed on the About page and in the
chat header. When bumping the version:

1. Update the version in `package.json`, `client/package.json` and
   `socket-server-cloudflare/package.json` (the client build injects
   `client/package.json` → `REACT_APP_VERSION` at build time).
2. Update `VERSION` in `socket-server-cloudflare/wrangler.toml` (exposed by
   `/health`).
3. Refresh lockfiles with `npm install --package-lock-only` in each workspace.

---

## Roadmap

- Multiple rooms and private conversations
- Peer-to-peer file transfer over WebRTC (signalling already exists)
- Native browser notifications
- Light / dark theme toggle

---

## License

Training project — no production license. Do not reuse the authentication
secret (`RANDOM_TOKEN_SECRET`) or the committed development certificates as-is.
