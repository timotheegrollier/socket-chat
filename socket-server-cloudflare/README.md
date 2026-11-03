# ReactSocketChat — Cloudflare Worker (Socket.IO)

Same deployment pattern as the GlobalShare socket server, adapted to the
ReactSocketChat events:

- `count` broadcast on connect/disconnect (online users).
- `newMsg` broadcast after a new message is posted.
- `reset` broadcast after the chat is reset/deleted.

## Local dev

```bash
npm install
npx wrangler dev --port 8787
```

## Test

```bash
SOCKET_URL=http://127.0.0.1:8787 npm run test:protocol
```

With the production frontend origin:

```bash
ORIGIN=https://socket-tchat.onrender.com SOCKET_URL=https://react-socket-chat.sitizstorm.workers.dev npm run test:protocol
```

## Deploy

```bash
cd client && npm install && npm run build
cd ../socket-server-cloudflare && npx wrangler deploy
```

Worker URL (current): `https://socket-chat.sitizstorm.workers.dev`

## Frontend

The Worker also serves the React SPA (see `client/build`) through the Cloudflare
Workers `ASSETS` binding. The client socket URL (see `client/src/config.json`) is
the deployed Worker URL and the client uses `transports: ['websocket']`. The
GitHub Pages deployment workflow has been removed; the frontend is served by the
Cloudflare Worker.
