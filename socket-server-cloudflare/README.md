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
npx wrangler deploy
```

Worker URL (current): `https://socket-chat.sitizstorm.workers.dev`

## Frontend

Update the client socket URL (see `client/src/config.json`) to the deployed
Worker URL and use `transports: ['websocket']`.
