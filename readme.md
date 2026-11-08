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
runs on **Cloudflare Workers + Durable Objects**, and the REST API on Render.

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
| Auth | Signup / login with bcrypt + JWT (24 h), stored in `localStorage` |
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
     ┌───────────────────────┐          ┌──────────────────────────────┐
     │  Node.js / Express    │          │  Cloudflare Worker           │
     │  Render               │          │  └─ Durable Object ChatRoom  │
     │  └─ MongoDB Atlas     │          │     (in-memory socket state) │
     │     users + messages  │          │                              │
     └───────────────────────┘          └──────────────────────────────┘

        React SPA (GitHub Pages) ── REST ──► Render
                                  ── WebSocket ──► Cloudflare Worker
```

- The **React SPA** is built by Create React App and deployed to **GitHub Pages**
  by the `pages.yml` workflow.
- The **Worker** routes `/socket.io/*` upgrades to a single **Durable Object**
  (`ChatRoom`), which implements the Engine.IO / Socket.IO protocol subset used
  by the client. It also keeps a self-contained copy of the static build through
  the `ASSETS` binding as a fallback.
- The **REST API** (Node.js / Express + MongoDB) runs on **Render**. It handles
  authentication and message persistence; the socket layer only notifies clients
  so they refetch through the API.
- **GitHub Actions** deploys the frontend to Pages, the Worker to Cloudflare and
  Render redeploys the API on every push to `master`.
- **GitHub image storage**: Images uploaded from the composer are stored as
  assets in the repository via the GitHub Contents API and served via
  `raw.githubusercontent.com`, fully contained in the GitHub ecosystem.

---

## Tech stack

- **Frontend:** React 17 (Create React App), React Router 6, SCSS, Bootstrap 5,
  socket.io-client, Axios
- **Realtime:** Cloudflare Workers + Durable Objects (TypeScript), a custom
  implementation of the Socket.IO packet format (Engine.IO v4)
- **API:** Node.js, Express, Mongoose, MongoDB Atlas, bcrypt, JWT
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
├── controllers/                # Express controllers (messages, users)
├── middleware/                 # auth, multer
├── models/                     # Mongoose schemas (chatMessage, tchatUser)
├── routes/                     # Express routers
├── app.js                      # Express app
├── server.js                   # HTTP/HTTPS + Socket.IO dev server
└── socket-server-cloudflare/   # Cloudflare Worker + Durable Object
    ├── src/index.ts
    ├── test/protocol.test.js
    └── wrangler.toml
```

---

## Getting started

### Prerequisites

- Node.js 20+
- A MongoDB Atlas connection string (or a local MongoDB)
- Wrangler (installed locally in `socket-server-cloudflare`)

### 1. Install

```bash
npm install
cd client && npm install && cd ..
cd socket-server-cloudflare && npm install && cd ..
```

### 2. Configure the API

Create a `.env` at the repository root:

```dotenv
DBUSER=<mongo-atlas-user>
PORT=3001
SSL_PORT=3002
```

> `app.js` builds the Mongo connection string from `DBUSER`.
> `server.js` also starts an HTTPS server and therefore expects `privkey.pem` /
> `cert.pem` at the repository root. For plain HTTP development, comment the
> `sslServer` lines in `server.js`.

### 3. Configure the client

`client/src/config.json` is ignored by git (environment-specific). Copy the
template and adjust the URLs:

```bash
cp client/src/config.example.json client/src/config.json
```

```json
{
    "api_url": "https://socket-tchat.onrender.com",
    "socket_url": "https://socket-chat.sitizstorm.workers.dev"
}
```

For purely local development, use `http://localhost:3001` for both entries (or
keep the existing CRA `proxy` setting and leave `api_url` empty).

### 4. Run

```bash
# Production-like: Express serves client/build
npm run build
npm start                # http://localhost:3001

# Or, hot-reload frontend against the local API
npm run client           # http://localhost:3000

# Local realtime worker (instead of the deployed one)
cd socket-server-cloudflare && npx wrangler dev --port 8787
```

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

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/api/secure/signup` | Create an account (pseudo, password, confirmPass, terms) |
| `POST` | `/api/secure/login` | Returns `{ userId, pseudo, token }` (JWT, 24 h) |
| `GET` | `/api/secure/:id` | Returns the user (pseudo) |
| `GET` | `/api/channels` | List channels (`general` is always present) |
| `POST` | `/api/channels/new` | Create a channel — `{ name }` (1-24 lowercase letters, numbers or hyphens) |
| `DELETE` | `/api/channels/:name` | Delete a channel and all its messages (`general` is protected) |
| `GET` | `/api/messages?channel=general` | List messages for a channel (`message`, `author`, `authorId`, `channel`, `createdAt`) |
| `POST` | `/api/messages/new` | Create a message — `{ message, author, authorId, channel }`; when `authorId` matches an account, the stored pseudo overrides `author` |
| `DELETE` | `/api/messages/:id` | Delete a message — `{ authorId }` must match the message owner |
| `DELETE` | `/api/messages?channel=general` | Delete all messages in a channel (chat reset) |

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
```

The protocol suite covers the health endpoint, connection count, `newMsg`,
`channelsChanged`, `channelDeleted`, `reset`, the presence list (`join` /
`presence`), the typing indicator between two clients, and `stopTyping`.

---

## CI / CD and branch protection

- **`master` is protected**: direct pushes are blocked, force pushes and branch
  deletion are disabled, and every change must go through a pull request.
- The **CI** workflow (`ci.yml`) runs on pull requests and on `master`:
  - `client`: install, generate `config.json` from repository variables, unit
    tests, production build.
  - `worker`: install, TypeScript typecheck, start `wrangler dev`, protocol tests.
- A pull request can only be merged when both checks are green.
- Merging to `master` triggers two deployments:
  - **Deploy** (`deploy.yml`) deploys the socket Worker to Cloudflare with
    `cloudflare/wrangler-action`, then smoke-tests `/health`.
  - **Deploy frontend to GitHub Pages** (`pages.yml`) builds the React app and
    publishes `client/build` to GitHub Pages. The repository's Pages source must
    be set to **GitHub Actions**.

### Required repository configuration

| Type | Name | Value |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | API token with *Workers Scripts: Edit* permission |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |
| Variable (optional) | `API_URL` | Overrides the REST API URL baked into the client |
| Variable (optional) | `SOCKET_URL` | Overrides the socket URL baked into the client |

If the Cloudflare secrets are missing, the deploy job is skipped with a warning
annotation instead of failing the pipeline.

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

- Image attachments (upload + preview)
- Multiple rooms and private conversations
- Peer-to-peer file transfer over WebRTC (signalling already exists)
- Native browser notifications
- Light / dark theme toggle

---

## License

Training project — no production license. Do not reuse the authentication
secret (`RANDOM_TOKEN_SECRET`) or the committed development certificates as-is.
