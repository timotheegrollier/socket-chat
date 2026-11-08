import { handleApi, handleImageUpload } from './api';

export interface Env {
  TCHAT: DurableObjectNamespace;
  ASSETS: {
    fetch: typeof fetch;
  };
  VERSION?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO_OWNER?: string;
  GITHUB_REPO_NAME?: string;
  GITHUB_BRANCH?: string;
  GITHUB_IMAGES_PATH?: string;
  JWT_SECRET?: string;
}

type BinaryAttachment = ArrayBuffer | ArrayBufferView;

interface PendingBinary {
  args: unknown[];
  attachments: BinaryAttachment[];
  remaining: number;
}

interface Client {
  id: string;
  ws: WebSocket;
  name?: string;
  room?: string;
  alive: boolean;
  closed: boolean;
  pendingBinary: PendingBinary | null;
  binaryQueue: Promise<void>;
}

const PING_INTERVAL_MS = 25_000;
// Mobile browsers suspend JavaScript when the screen locks, so give them a
// longer grace period before declaring the socket dead. On resume the client
// also forces a fresh connection and re-syncs anything it missed.
const PING_TIMEOUT_MS = 60_000;
const MAX_ROOM_LENGTH = 64;
const MAX_NAME_LENGTH = 64;
const MAX_MESSAGE_LENGTH = 500;
const MAX_AUTHOR_LENGTH = 12;
const MAX_ID_LENGTH = 64;
const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,23}$/;

interface ChatMessagePayload {
  _id: string;
  message: string;
  imageUrl?: string;
  author: string;
  authorId: string;
  channel: string;
  createdAt: string;
}

const readChannel = (payload: unknown): string => {
  let raw: unknown;
  if (typeof payload === 'string') {
    raw = payload;
  } else if (payload && typeof payload === 'object') {
    raw = (payload as { channel?: unknown }).channel;
  }
  if (typeof raw !== 'string') return '';
  const name = raw.trim().toLowerCase().replace(/^#/, '');
  return CHANNEL_PATTERN.test(name) ? name : '';
};

// A saved message travels with the `newMsg` event so every client can append
// it without an extra REST round-trip. Treat it as untrusted input: clamp
// every field, and fall back to the legacy channel-only notification when the
// payload is incomplete.
const readMessage = (payload: unknown, fallbackChannel: string): ChatMessagePayload | null => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = (payload as { message?: unknown }).message;
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data._id !== 'string' || typeof data.message !== 'string') return null;

  const id = data._id.trim().slice(0, MAX_ID_LENGTH);
  const message = data.message.trim().slice(0, MAX_MESSAGE_LENGTH);
  const channel = readChannel(data) || fallbackChannel;
  if (!id || !message || !channel) return null;

  const author = typeof data.author === 'string'
    ? data.author.trim().slice(0, MAX_AUTHOR_LENGTH)
    : '';
  const authorId = typeof data.authorId === 'string'
    ? data.authorId.trim().slice(0, MAX_ID_LENGTH)
    : '';
  // Keep attachments in the realtime payload so recipients render the image
  // immediately instead of waiting for a refetch. Only allow our own storage.
  const rawImageUrl = typeof data.imageUrl === 'string' ? data.imageUrl.trim().slice(0, 1000) : '';
  const imageUrl = rawImageUrl.startsWith('/images/') ||
    /^https:\/\/raw\.githubusercontent\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[^/]+\/.+$/.test(rawImageUrl)
    ? rawImageUrl
    : '';
  const rawCreatedAt = typeof data.createdAt === 'string' ? new Date(data.createdAt) : null;
  const createdAt = rawCreatedAt && !Number.isNaN(rawCreatedAt.getTime())
    ? rawCreatedAt.toISOString()
    : new Date().toISOString();

  return {
    _id: id,
    message,
    ...(imageUrl ? { imageUrl } : {}),
    author: author || 'Anonymous',
    authorId,
    channel,
    createdAt,
  };
};

// The chat frontend origin and local development origins. Add any custom
// frontend domain here before deploying it.
const ALLOWED_ORIGINS = new Set([
  'https://timotheegrollier.github.io',
  'https://socket-chat.sitizstorm.workers.dev',
  'http://localhost:8787',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:8787',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          version: env.VERSION ?? 'development',
          timestamp: new Date().toISOString(),
        }),
        {
          headers: {
            'content-type': 'application/json',
            'access-control-allow-origin': '*',
            'cache-control': 'no-store',
          },
        }
      );
    }

    // Image uploads talk to GitHub directly from the worker (token stays here).
    if (url.pathname === '/api/images' || url.pathname.startsWith('/api/images/')) {
      return handleImageUpload(request, env);
    }

    // The rest of the REST API runs in the Durable Object so it shares its
    // SQLite storage with no extra Cloudflare resource.
    if (url.pathname.startsWith('/api/')) {
      const id = env.TCHAT.idFromName('tchat');
      return env.TCHAT.get(id).fetch(request);
    }

    if (url.pathname.startsWith('/socket.io/')) {
      const upgrade = request.headers.get('Upgrade');
      if (upgrade?.toLowerCase() !== 'websocket') {
        return new Response('This endpoint requires a WebSocket connection.', {
          status: 400,
        });
      }

      const origin = request.headers.get('Origin');
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        return new Response('Origin not allowed.', { status: 403 });
      }

      // A single Durable Object keeps the same in-memory Node server state.
      // It can be sharded by room later if needed.
      const id = env.TCHAT.idFromName('tchat');
      return env.TCHAT.get(id).fetch(request);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status === 404) {
      // SPA fallback: unknown client-side routes serve the React app shell.
      return env.ASSETS.fetch(new URL('/index.html', request.url).toString());
    }
    return assetResponse;
  },
};

export class ChatRoom {
  private sockets = new Map<string, Client>();
  private rooms = new Map<string, Set<string>>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private userCount = 0;
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade');
    if (upgrade?.toLowerCase() !== 'websocket') {
      // Non-realtime requests are the REST API. Running it here gives it the
      // Durable Object's SQLite database without any extra Cloudflare resource.
      return handleApi(request, this.state.storage.sql, this.env);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.acceptSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  private acceptSocket(ws: WebSocket): void {
    ws.accept();

    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const client: Client = {
      id,
      ws,
      alive: true,
      closed: false,
      pendingBinary: null,
      binaryQueue: Promise.resolve(),
    };
    this.sockets.set(id, client);

    ws.addEventListener('message', (event) => {
      this.handleMessage(client, event.data);
    });
    ws.addEventListener('close', () => {
      this.handleClose(client);
    });
    ws.addEventListener('error', () => {
      this.handleClose(client);
    });

    this.sendRaw(
      client,
      '0' +
        JSON.stringify({
          sid: id,
          upgrades: [],
          pingInterval: PING_INTERVAL_MS,
          pingTimeout: PING_TIMEOUT_MS,
          maxPayload: 1_000_000,
        })
    );

    this.ensurePingTimer();
  }

  private ensurePingTimer(): void {
    if (this.pingTimer !== null) return;

    this.pingTimer = setInterval(() => {
      for (const client of this.sockets.values()) {
        if (client.closed) continue;

        if (!client.alive) {
          try {
            client.ws.close(1001, 'ping timeout');
          } catch {
            // ignore
          }
          this.handleClose(client);
          continue;
        }

        client.alive = false;
        this.sendRaw(client, '2');
      }
    }, PING_INTERVAL_MS);
  }

  private stopPingTimerIfIdle(): void {
    if (this.sockets.size > 0 || this.pingTimer === null) return;
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private handleMessage(
    client: Client,
    data: string | ArrayBuffer | ArrayBufferView | Blob
  ): void {
    if (client.closed) return;

    if (typeof data !== 'string') {
      // Binary attachments follow the BINARY_EVENT header. In some runtimes
      // (and in Miniflare) they are delivered as Blob, so normalize them and
      // preserve their order with a per-client queue.
      const task = async () => {
        const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
        this.handleBinaryAttachment(client, buffer);
      };
      client.binaryQueue = client.binaryQueue.then(task, task);
      return;
    }

    if (data === '2') {
      this.sendRaw(client, '3');
      return;
    }

    if (data === '3') {
      client.alive = true;
      return;
    }

    if (data === '1') {
      try {
        client.ws.close(1000, 'client close');
      } catch {
        // ignore
      }
      this.handleClose(client);
      return;
    }

    if (data.startsWith('40')) {
      this.sendRaw(client, '40' + JSON.stringify({ sid: client.id }));
      this.userCount += 1;
      this.broadcastToAll('count', this.userCount);
      this.broadcastPresence();
      return;
    }

    if (data.startsWith('42')) {
      this.handleTextEvent(client, data.slice(2));
      return;
    }

    if (data.startsWith('45')) {
      this.handleBinaryEventHeader(client, data);
      return;
    }

    if (data.startsWith('41')) {
      this.handleClose(client);
    }
  }

  private handleTextEvent(client: Client, json: string): void {
    let args: unknown[];
    try {
      args = JSON.parse(json);
    } catch {
      return;
    }
    if (!Array.isArray(args) || args.length === 0 || typeof args[0] !== 'string') {
      return;
    }

    const eventName = args[0];
    const payload = args[1];

    if (eventName === 'join') {
      this.handleJoin(client, payload);
      return;
    }

    if (eventName === 'join-room') {
      this.handleJoinRoom(client, payload);
      return;
    }

    if (eventName === 'offer' || eventName === 'answer' || eventName === 'ice-candidate') {
      this.handleSignal(client, eventName, payload);
      return;
    }

    if (eventName === 'relay-data') {
      this.handleRelayText(client, payload);
      return;
    }

    if (eventName === 'newMsg') {
      const channel = readChannel(payload);
      const message = readMessage(payload, channel);
      if (message) {
        this.broadcastToAll('newMsg', { channel: message.channel, message });
      } else {
        this.broadcastToAll('newMsg', channel ? { channel } : {});
      }
      return;
    }

    if (eventName === 'channelsChanged') {
      this.broadcastToAll('channelsChanged', {});
      return;
    }

    if (eventName === 'channelDeleted') {
      const channel = readChannel(payload);
      this.broadcastToAll('channelDeleted', channel ? { channel } : {});
      return;
    }

    if (eventName === 'typing' || eventName === 'stopTyping') {
      this.handleTyping(client, eventName, payload);
      return;
    }

    if (eventName === 'resetTchat') {
      const channel = readChannel(payload);
      this.broadcastToAll('reset', channel ? { channel } : {});
      return;
    }

    if (eventName === 'count') {
      this.broadcastToAll('refreshCount', {});
      return;
    }
  }

  private handleJoinRoom(client: Client, payload: unknown): void {
    if (!payload || typeof payload !== 'object') return;
    const { roomId, name } = payload as { roomId?: unknown; name?: unknown };

    if (typeof roomId !== 'string' || typeof name !== 'string') return;
    const cleanRoom = roomId.trim().slice(0, MAX_ROOM_LENGTH);
    const cleanName = name.trim().slice(0, MAX_NAME_LENGTH) || 'Appareil';
    if (!cleanRoom) return;

    if (client.room && client.room !== cleanRoom) {
      this.leaveRoom(client);
    }

    client.room = cleanRoom;
    client.name = cleanName;

    let room = this.rooms.get(cleanRoom);
    if (!room) {
      room = new Set();
      this.rooms.set(cleanRoom, room);
    }
    room.add(client.id);

    const others = Array.from(room)
      .filter((id) => id !== client.id)
      .map((id) => ({
        id,
        name: this.sockets.get(id)?.name ?? 'Appareil',
      }));

    this.sendEvent(client, 'room-users', others);
    this.broadcastEvent(
      cleanRoom,
      'user-joined',
      { id: client.id, name: cleanName },
      client.id
    );
  }

  private handleSignal(client: Client, eventName: string, payload: unknown): void {
    if (!payload || typeof payload !== 'object') return;
    const targetId = (payload as { target?: unknown }).target;
    if (typeof targetId !== 'string') return;

    const target = this.sockets.get(targetId);
    if (!target) return;

    this.sendEvent(target, eventName, {
      ...(payload as Record<string, unknown>),
      caller: client.id,
    });
  }

  private handleJoin(client: Client, payload: unknown): void {
    let name = '';
    if (typeof payload === 'string') {
      name = payload.trim().slice(0, MAX_NAME_LENGTH);
    } else if (payload && typeof payload === 'object') {
      const raw = (payload as { name?: unknown }).name;
      if (typeof raw === 'string') {
        name = raw.trim().slice(0, MAX_NAME_LENGTH);
      }
    }
    client.name = name || 'Anonymous';
    this.broadcastPresence();
  }

  private broadcastPresence(): void {
    const users = Array.from(this.sockets.values())
      .filter((client) => !client.closed)
      .map((client) => ({ id: client.id, name: client.name ?? 'Anonymous' }));
    this.broadcastToAll('presence', users);
  }

  private handleTyping(
    client: Client,
    eventName: 'typing' | 'stopTyping',
    payload: unknown
  ): void {
    let name = '';
    if (typeof payload === 'string') {
      name = payload.trim().slice(0, MAX_NAME_LENGTH);
    } else if (payload && typeof payload === 'object') {
      const raw = (payload as { name?: unknown }).name;
      if (typeof raw === 'string') {
        name = raw.trim().slice(0, MAX_NAME_LENGTH);
      }
    }
    const channel = readChannel(payload);
    this.broadcastExcept(client.id, eventName, channel ? { name, channel } : { name });
  }

  private handleRelayText(client: Client, payload: unknown): void {    if (!payload || typeof payload !== 'object') return;
    const { target: targetId, data, meta } = payload as {
      target?: unknown;
      data?: unknown;
      meta?: unknown;
    };
    if (typeof targetId !== 'string') return;

    const target = this.sockets.get(targetId);
    if (!target) return;

    this.sendEvent(target, 'relay-data', {
      from: client.id,
      data: data ?? null,
      meta: meta ?? null,
    });
  }

  private handleBinaryEventHeader(client: Client, data: string): void {
    // Wire format: "45" + attachment count + "-" + JSON args.
    const dash = data.indexOf('-', 2);
    if (dash === -1) return;

    const count = Number.parseInt(data.slice(2, dash), 10);
    if (!Number.isFinite(count) || count < 1) return;

    let args: unknown[];
    try {
      args = JSON.parse(data.slice(dash + 1));
    } catch {
      return;
    }
    if (!Array.isArray(args) || args.length === 0 || typeof args[0] !== 'string') {
      return;
    }

    client.pendingBinary = {
      args,
      attachments: [],
      remaining: count,
    };
  }

  private handleBinaryAttachment(
    client: Client,
    data: ArrayBuffer | ArrayBufferView
  ): void {
    const pending = client.pendingBinary;
    if (!pending) return;

    pending.attachments.push(data);
    pending.remaining -= 1;

    if (pending.remaining > 0) return;

    client.pendingBinary = null;
    this.handleBinaryEvent(client, pending.args, pending.attachments);
  }

  private handleBinaryEvent(
    client: Client,
    args: unknown[],
    attachments: BinaryAttachment[]
  ): void {
    const eventName = args[0];
    if (typeof eventName !== 'string') return;

    const payload = args[1];
    if (!payload || typeof payload !== 'object') return;
    const targetId = (payload as { target?: unknown }).target;
    if (typeof targetId !== 'string') return;

    const target = this.sockets.get(targetId);
    if (!target) return;

    if (eventName === 'relay-data') {
      const meta = (payload as { meta?: unknown }).meta ?? null;
      this.sendBinaryEvent(
        target,
        [
          'relay-data',
          {
            from: client.id,
            data: { _placeholder: true, num: 0 },
            meta,
          },
        ],
        [attachments[0]]
      );
      return;
    }

    if (eventName === 'offer' || eventName === 'answer' || eventName === 'ice-candidate') {
      this.sendBinaryEvent(
        target,
        [
          eventName,
          { ...(payload as Record<string, unknown>), caller: client.id },
        ],
        attachments
      );
    }
  }

  private handleClose(client: Client): void {
    if (client.closed) return;
    client.closed = true;

    this.leaveRoom(client);
    this.sockets.delete(client.id);
    this.userCount = Math.max(0, this.userCount - 1);
    this.broadcastToAll('count', this.userCount);
    this.broadcastPresence();
    this.stopPingTimerIfIdle();
  }

  private broadcastToAll(eventName: string, payload: unknown): void {
    for (const client of this.sockets.values()) {
      if (client.closed) continue;
      this.sendEvent(client, eventName, payload);
    }
  }

  private broadcastExcept(
    exceptId: string,
    eventName: string,
    payload: unknown
  ): void {
    for (const client of this.sockets.values()) {
      if (client.closed || client.id === exceptId) continue;
      this.sendEvent(client, eventName, payload);
    }
  }

  private leaveRoom(client: Client): void {
    const roomId = client.room;
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(client.id);
      if (room.size === 0) {
        this.rooms.delete(roomId);
      } else {
        this.broadcastEvent(roomId, 'user-left', client.id);
      }
    }

    client.room = undefined;
  }

  private sendRaw(client: Client, data: string): void {
    if (client.closed) return;
    try {
      client.ws.send(data);
    } catch {
      this.handleClose(client);
    }
  }

  private sendEvent(client: Client, eventName: string, payload: unknown): void {
    this.sendRaw(client, '42' + JSON.stringify([eventName, payload]));
  }

  private sendBinaryEvent(
    client: Client,
    args: unknown[],
    attachments: BinaryAttachment[]
  ): void {
    if (client.closed) return;
    try {
      client.ws.send('45' + attachments.length + '-' + JSON.stringify(args));
      for (const attachment of attachments) {
        client.ws.send(attachment);
      }
    } catch {
      this.handleClose(client);
    }
  }

  private broadcastEvent(
    roomId: string,
    eventName: string,
    payload: unknown,
    exceptId?: string
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const id of room) {
      if (id === exceptId) continue;
      const client = this.sockets.get(id);
      if (client) this.sendEvent(client, eventName, payload);
    }
  }
}
