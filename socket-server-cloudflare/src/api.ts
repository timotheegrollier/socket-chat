// REST API for Socket Chat, running inside the existing Cloudflare Worker.
//
// Storage lives in the SQLite database of the `tchat` Durable Object, so the
// API needs no extra Cloudflare resource: users, channels and messages are
// persisted next to the realtime state. Images are uploaded to the GitHub
// repository through the Contents API and served from raw.githubusercontent.com.
//
// The HTTP contract mirrors the previous Express/MongoDB API so the React
// client keeps working unchanged.

export interface ApiEnv {
  GITHUB_TOKEN?: string;
  GITHUB_REPO_OWNER?: string;
  GITHUB_REPO_NAME?: string;
  GITHUB_BRANCH?: string;
  GITHUB_IMAGES_PATH?: string;
  JWT_SECRET?: string;
}

const DEFAULT_CHANNEL = 'general';
const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,23}$/;
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const MAX_MESSAGE_LENGTH = 500;
const MAX_AUTHOR_LENGTH = 12;
const MAX_AUTHOR_ID_LENGTH = 64;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_PSEUDO_LENGTH = 4;
const MAX_PSEUDO_LENGTH = 12;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 20;
const PBKDF2_ITERATIONS = 100_000;
const TOKEN_TTL_SECONDS = 24 * 60 * 60;

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
  'access-control-max-age': '86400',
};

// ---------- small utilities ----------

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS_HEADERS },
  });

const preflight = (): Response => new Response(null, { status: 204, headers: CORS_HEADERS });

const normalizeChannel = (value: unknown): string => {
  if (typeof value !== 'string') return DEFAULT_CHANNEL;
  const name = value.trim().toLowerCase().replace(/^#/, '');
  return CHANNEL_PATTERN.test(name) ? name : DEFAULT_CHANNEL;
};

const readChannelName = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/^#/, '');
};

const normalizePseudo = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const newObjectId = (): string => crypto.randomUUID().replace(/-/g, '').slice(0, 24);

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const base64UrlToBytes = (value: string): Uint8Array => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return base64ToBytes(padded);
};

const base64Url = (value: string): string =>
  bytesToBase64(new TextEncoder().encode(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
};

const readJson = async (request: Request): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

// A message may only reference local legacy uploads or images stored in this
// repository. Anything else is ignored so the API cannot be used to embed
// arbitrary remote content.
const isAllowedImageUrl = (value: string): boolean => {
  if (value.startsWith('/images/')) return true;
  return /^https:\/\/raw\.githubusercontent\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[^/]+\/.+$/.test(value);
};

// ---------- password hashing (WebCrypto PBKDF2) ----------

const derivePassword = async (password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256
  );
  return new Uint8Array(bits);
};

const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
};

const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [scheme, iterationsRaw, saltRaw, hashRaw] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iterationsRaw || !saltRaw || !hashRaw) return false;
  const iterations = Number.parseInt(iterationsRaw, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const expected = base64ToBytes(hashRaw);
  const actual = await derivePassword(password, base64ToBytes(saltRaw), iterations);
  return timingSafeEqual(actual, expected);
};

// ---------- JWT (HS256) ----------

const signToken = async (userId: string, secret: string): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({ userId, iat: now, exp: now + TOKEN_TTL_SECONDS })
  );
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const encoded = bytesToBase64(new Uint8Array(signature))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${data}.${encoded}`;
};

const jwtSecret = (env: ApiEnv): string => env.JWT_SECRET || 'RANDOM_TOKEN_SECRET';

const readBearerToken = (request: Request): string => {
  const header = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
};

// Verify the HS256 signature and the expiry before trusting the user id from a
// token. Without this check any crafted token could impersonate an account.
const verifyToken = async (token: string, secret: string): Promise<string | null> => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerRaw, payloadRaw, signatureRaw] = parts;
  if (!headerRaw || !payloadRaw || !signatureRaw) return null;

  let header: { alg?: unknown };
  let payload: { userId?: unknown; exp?: unknown };
  let signature: Uint8Array;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerRaw)));
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadRaw)));
    signature = base64UrlToBytes(signatureRaw);
  } catch {
    return null;
  }

  if (!header || header.alg !== 'HS256') return null;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      new TextEncoder().encode(`${headerRaw}.${payloadRaw}`)
    );
    if (!valid) return null;
  } catch {
    return null;
  }

  const exp = typeof payload.exp === 'number' ? payload.exp : 0;
  if (exp <= Math.floor(Date.now() / 1000)) return null;

  return typeof payload.userId === 'string' && payload.userId ? payload.userId : null;
};

type AuthResult = { user: UserRow } | { response: Response };

const authenticate = async (
  request: Request,
  sql: SqlStorage,
  env: ApiEnv
): Promise<AuthResult> => {
  const token = readBearerToken(request);
  if (!token) return { response: json({ error: 'Authentication required' }, 401) };

  const userId = await verifyToken(token, jwtSecret(env));
  if (!userId) {
    return { response: json({ error: 'Your session has expired. Please log in again.' }, 401) };
  }

  const user = findUserById(sql, userId);
  if (!user) return { response: json({ error: 'Account not found' }, 401) };
  return { user };
};

// ---------- SQLite storage (inside the Durable Object) ----------

interface SqlStorage {
  exec: (query: string, ...bindings: unknown[]) => { toArray: () => Record<string, unknown>[] };
}

interface UserRow {
  id: string;
  pseudo: string;
  password: string;
  created_at: string;
}

interface ChannelRow {
  name: string;
  created_at: string;
}

interface MessageRow {
  id: string;
  message: string;
  image_url: string | null;
  author: string;
  author_id: string;
  channel: string;
  created_at: string;
}

const ensureSchema = (sql: SqlStorage): void => {
  sql.exec(
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      pseudo TEXT NOT NULL,
      pseudo_lower TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  );
  sql.exec(
    `CREATE TABLE IF NOT EXISTS channels (
      name TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    )`
  );
  sql.exec(
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL DEFAULT '',
      image_url TEXT,
      author TEXT,
      author_id TEXT,
      channel TEXT NOT NULL DEFAULT 'general',
      created_at TEXT NOT NULL
    )`
  );
  sql.exec('CREATE INDEX IF NOT EXISTS messages_channel_created ON messages (channel, created_at)');
};

const toMessage = (row: MessageRow) => ({
  _id: row.id,
  message: row.message,
  ...(row.image_url ? { imageUrl: row.image_url } : {}),
  author: row.author,
  authorId: row.author_id,
  channel: row.channel,
  createdAt: row.created_at,
});

const toUser = (row: UserRow) => ({
  _id: row.id,
  pseudo: row.pseudo,
  createdAt: row.created_at,
});

// ---------- API handlers ----------

const findUserByPseudo = (sql: SqlStorage, pseudo: string): UserRow | null => {
  const lower = pseudo.toLowerCase();
  if (!lower) return null;
  const rows = sql
    .exec('SELECT id, pseudo, password, created_at FROM users WHERE pseudo_lower = ?', lower)
    .toArray() as unknown as UserRow[];
  return rows[0] ?? null;
};

const findUserById = (sql: SqlStorage, id: string): UserRow | null => {
  if (!OBJECT_ID_PATTERN.test(id)) return null;
  const rows = sql
    .exec('SELECT id, pseudo, password, created_at FROM users WHERE id = ?', id)
    .toArray() as unknown as UserRow[];
  return rows[0] ?? null;
};

const validateSignup = (body: Record<string, unknown>): { msg: string }[] => {
  const errors: { msg: string }[] = [];
  const pseudo = normalizePseudo(body.pseudo);
  const password = typeof body.password === 'string' ? body.password : '';
  if (pseudo.length < MIN_PSEUDO_LENGTH || pseudo.length > MAX_PSEUDO_LENGTH) {
    errors.push({ msg: 'Pseudo must be at least 4 characters and 12 max' });
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    errors.push({ msg: 'Password be at least 4 characters' });
  }
  return errors;
};

const handleSignup = async (
  request: Request,
  sql: SqlStorage,
  env: ApiEnv
): Promise<Response> => {
  const body = await readJson(request);
  const errors = validateSignup(body);
  if (errors.length > 0) return json({ errors }, 422);

  if (body.terms !== true) return json({ termsError: 'Please accept terms of use !' }, 423);
  if (body.password !== body.confirmPass) {
    return json({ termsError: "Passwords don't match !" }, 423);
  }

  const pseudo = normalizePseudo(body.pseudo);
  if (findUserByPseudo(sql, pseudo)) {
    return json({ error: 'Pseudo must be unique' }, 400);
  }

  const id = newObjectId();
  const createdAt = new Date().toISOString();
  const passwordHash = await hashPassword(String(body.password));
  try {
    sql.exec(
      'INSERT INTO users (id, pseudo, pseudo_lower, password, created_at) VALUES (?, ?, ?, ?, ?)',
      id,
      pseudo,
      pseudo.toLowerCase(),
      passwordHash,
      createdAt
    );
  } catch {
    // Unique index racing with a concurrent signup.
    return json({ error: 'Pseudo must be unique' }, 400);
  }
  return json({ message: 'Utilisateur créé !' }, 201);
};

const handleLogin = async (
  request: Request,
  sql: SqlStorage,
  env: ApiEnv
): Promise<Response> => {
  const body = await readJson(request);
  const pseudo = normalizePseudo(body.pseudo);
  const password = typeof body.password === 'string' ? body.password : '';
  const user = findUserByPseudo(sql, pseudo);
  const invalid = json({ error: 'You have entered an invalid username or password' }, 401);
  if (!user) return invalid;
  const valid = await verifyPassword(password, user.password);
  if (!valid) return invalid;
  const token = await signToken(user.id, jwtSecret(env));
  return json({ userId: user.id, pseudo: user.pseudo, token });
};

// The JWT only carries the user id, so a pseudo change does not invalidate the
// session. Old messages are re-attributed to the new pseudo so the whole
// conversation keeps a consistent author name.
const handleUpdateAccount = async (
  request: Request,
  sql: SqlStorage,
  env: ApiEnv
): Promise<Response> => {
  const auth = await authenticate(request, sql, env);
  if ('response' in auth) return auth.response;
  const { user } = auth;

  const body = await readJson(request);
  const pseudo = normalizePseudo(body.pseudo);
  if (pseudo.length < MIN_PSEUDO_LENGTH || pseudo.length > MAX_PSEUDO_LENGTH) {
    return json(
      { errors: [{ msg: 'Pseudo must be at least 4 characters and 12 max' }] },
      422
    );
  }

  const existing = findUserByPseudo(sql, pseudo);
  if (existing && existing.id !== user.id) {
    return json({ error: 'Pseudo must be unique' }, 400);
  }

  if (pseudo !== user.pseudo) {
    try {
      sql.exec(
        'UPDATE users SET pseudo = ?, pseudo_lower = ? WHERE id = ?',
        pseudo,
        pseudo.toLowerCase(),
        user.id
      );
    } catch {
      // Unique index racing with a concurrent signup or rename.
      return json({ error: 'Pseudo must be unique' }, 400);
    }
    sql.exec('UPDATE messages SET author = ? WHERE author_id = ?', pseudo, user.id);
  }

  const updated = findUserById(sql, user.id) ?? { ...user, pseudo };
  return json({ user: toUser(updated) });
};

const handleChangePassword = async (
  request: Request,
  sql: SqlStorage,
  env: ApiEnv
): Promise<Response> => {
  const auth = await authenticate(request, sql, env);
  if ('response' in auth) return auth.response;
  const { user } = auth;

  const body = await readJson(request);
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmPass = typeof body.confirmPass === 'string' ? body.confirmPass : '';

  const errors: { msg: string }[] = [];
  if (!currentPassword) {
    errors.push({ msg: 'Current password is required' });
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    errors.push({ msg: 'Password must be between 4 and 20 characters' });
  }
  if (errors.length > 0) return json({ errors }, 422);

  if (password !== confirmPass) {
    return json({ errors: [{ msg: "Passwords don't match" }] }, 422);
  }

  if (!(await verifyPassword(currentPassword, user.password))) {
    return json({ error: 'Current password is incorrect' }, 400);
  }

  const passwordHash = await hashPassword(password);
  sql.exec('UPDATE users SET password = ? WHERE id = ?', passwordHash, user.id);
  return json({ message: 'Password updated' });
};

const handleGetMe = async (
  request: Request,
  sql: SqlStorage,
  env: ApiEnv
): Promise<Response> => {
  const auth = await authenticate(request, sql, env);
  if ('response' in auth) return auth.response;
  return json({ user: toUser(auth.user) });
};

const handleGetChannels = (sql: SqlStorage): Response => {
  const rows = sql
    .exec('SELECT name, created_at FROM channels ORDER BY created_at ASC')
    .toArray() as unknown as ChannelRow[];
  const channels: { name: string; createdAt: string | null }[] = rows.map((row) => ({
    name: row.name,
    createdAt: row.created_at,
  }));
  if (!channels.some((channel) => channel.name === DEFAULT_CHANNEL)) {
    channels.unshift({ name: DEFAULT_CHANNEL, createdAt: null });
  }
  return json({ channels });
};

const handleNewChannel = async (request: Request, sql: SqlStorage): Promise<Response> => {
  const body = await readJson(request);
  const name = readChannelName(body.name);
  if (!CHANNEL_PATTERN.test(name)) {
    return json(
      { error: 'Channel names must be 1-24 characters: lowercase letters, numbers or hyphens.' },
      422
    );
  }
  if (name === DEFAULT_CHANNEL) return json({ error: '#general already exists.' }, 409);
  const existing = sql.exec('SELECT name FROM channels WHERE name = ?', name).toArray();
  if (existing.length > 0) return json({ error: 'This channel already exists.' }, 409);
  const createdAt = new Date().toISOString();
  sql.exec('INSERT INTO channels (name, created_at) VALUES (?, ?)', name, createdAt);
  return json({ channel: { name, createdAt } }, 201);
};

const handleDeleteChannel = (nameRaw: string, sql: SqlStorage): Response => {
  const name = readChannelName(nameRaw);
  if (!CHANNEL_PATTERN.test(name)) return json({ error: 'Invalid channel name.' }, 422);
  if (name === DEFAULT_CHANNEL) return json({ error: '#general cannot be deleted.' }, 400);
  const existing = sql.exec('SELECT name FROM channels WHERE name = ?', name).toArray();
  if (existing.length === 0) return json({ error: 'Channel not found.' }, 404);
  sql.exec('DELETE FROM channels WHERE name = ?', name);
  sql.exec('DELETE FROM messages WHERE channel = ?', name);
  return json({ name });
};

const handleGetMessages = (url: URL, sql: SqlStorage): Response => {
  const channel = normalizeChannel(url.searchParams.get('channel'));
  const rows = sql
    .exec(
      'SELECT id, message, image_url, author, author_id, channel, created_at FROM messages WHERE channel = ? ORDER BY created_at ASC',
      channel
    )
    .toArray() as unknown as MessageRow[];
  return json({ messages: rows.map(toMessage), channel });
};

const handleNewMessage = async (request: Request, sql: SqlStorage): Promise<Response> => {
  const body = await readJson(request);
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE_LENGTH) : '';
  const rawImageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim().slice(0, 1000) : '';
  const imageUrl = rawImageUrl && isAllowedImageUrl(rawImageUrl) ? rawImageUrl : '';

  if (!message && !imageUrl) return json({ error: 'Message vide !' }, 400);

  const author = typeof body.author === 'string' ? body.author.trim().slice(0, MAX_AUTHOR_LENGTH) : '';
  const authorId = typeof body.authorId === 'string' ? body.authorId.trim().slice(0, MAX_AUTHOR_ID_LENGTH) : '';
  const channel = normalizeChannel(body.channel);

  // The stored pseudo is authoritative whenever the author id points to an
  // account, so a client with a stale profile never stores "Anonymous".
  const user = authorId ? findUserById(sql, authorId) : null;
  const resolvedAuthor = user ? user.pseudo : author || 'Anonymous';

  const row: MessageRow = {
    id: newObjectId(),
    message,
    image_url: imageUrl || null,
    author: resolvedAuthor,
    author_id: authorId,
    channel,
    created_at: new Date().toISOString(),
  };
  sql.exec(
    'INSERT INTO messages (id, message, image_url, author, author_id, channel, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    row.id,
    row.message,
    row.image_url,
    row.author,
    row.author_id,
    row.channel,
    row.created_at
  );
  return json({ msg: toMessage(row) });
};

const handleDeleteMessages = (url: URL, sql: SqlStorage, body: Record<string, unknown>): Response => {
  const raw = url.searchParams.get('channel') ?? (typeof body.channel === 'string' ? body.channel : '');
  const channel = normalizeChannel(raw);
  sql.exec('DELETE FROM messages WHERE channel = ?', channel);
  return json({ msg: 'Tchat supprimé !', channel });
};

const handleDeleteMessage = async (
  id: string,
  request: Request,
  sql: SqlStorage
): Promise<Response> => {
  const body = await readJson(request);
  const authorId = typeof body.authorId === 'string' ? body.authorId : '';
  const rows = sql
    .exec('SELECT id, message, image_url, author, author_id, channel, created_at FROM messages WHERE id = ?', id)
    .toArray() as unknown as MessageRow[];
  const message = rows[0];
  if (!message) return json({ error: 'Message introuvable' }, 404);
  if (message.author_id && message.author_id !== authorId) {
    return json({ error: 'Action non autorisée' }, 403);
  }
  sql.exec('DELETE FROM messages WHERE id = ?', id);
  return json({ msg: 'Message supprimé !' });
};

// ---------- image upload (GitHub Contents API) ----------

const sanitizeFileBase = (name: string): string => {
  const base = (name || 'image')
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'image';
};

const createImagesBranch = async (
  owner: string,
  repo: string,
  branch: string,
  token: string
): Promise<boolean> => {
  const headers = {
    authorization: `token ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'socket-chat-worker',
  };

  try {
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoResponse.ok) return false;
    const repoData = (await repoResponse.json()) as { default_branch?: string };
    const defaultBranch = repoData.default_branch || 'master';

    const refResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`,
      { headers }
    );
    if (!refResponse.ok) return false;
    const refData = (await refResponse.json()) as { object?: { sha?: string } };
    const sha = refData.object?.sha;
    if (!sha) return false;

    const createResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
    });
    // 422 means another upload created the branch first: treat it as success.
    return createResponse.ok || createResponse.status === 422;
  } catch {
    return false;
  }
};

export const handleImageUpload = async (request: Request, env: ApiEnv): Promise<Response> => {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = env.GITHUB_TOKEN || '';
  if (!token) return json({ error: 'Image storage is not configured.' }, 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Expected a multipart form with an image field.' }, 400);
  }
  const file = form.get('image');
  if (!file || typeof file === 'string') return json({ error: 'No image file received.' }, 400);

  const extension = IMAGE_EXTENSIONS[file.type];
  if (!extension) return json({ error: 'Unsupported file type.' }, 400);
  if (file.size > MAX_IMAGE_BYTES) return json({ error: 'Image file is too large (max 8MB).' }, 413);

  const owner = env.GITHUB_REPO_OWNER || 'timotheegrollier';
  const repo = env.GITHUB_REPO_NAME || 'socket-chat';
  const branch = env.GITHUB_BRANCH || 'images';
  const directory = (env.GITHUB_IMAGES_PATH || 'images').replace(/^\/+|\/+$/g, '');
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 6);
  const filename = `${sanitizeFileBase(file.name)}-${Date.now()}-${random}.${extension}`;
  const contentPath = `${directory}/${filename}`;
  const content = bytesToBase64(new Uint8Array(await file.arrayBuffer()));

  const putContent = () =>
    fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${contentPath}`, {
      method: 'PUT',
      headers: {
        authorization: `token ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'socket-chat-worker',
      },
      body: JSON.stringify({
        message: `Upload ${filename}`,
        content,
        branch,
      }),
    });

  let response: Response;
  try {
    response = await putContent();
    if (!response.ok && (response.status === 404 || response.status === 409)) {
      // The dedicated upload branch may not exist yet (or a protected default
      // branch rejected the write). Create `images` from the default branch and
      // retry once.
      const ensured = await createImagesBranch(owner, repo, branch, token);
      if (ensured) response = await putContent();
    }
  } catch {
    return json({ error: 'GitHub is unreachable right now.' }, 502);
  }

  if (!response.ok) {
    if (response.status === 401) return json({ error: 'GitHub authentication failed.' }, 502);
    if (response.status === 403) {
      return json({ error: 'GitHub API rate limit exceeded. Please try again later.' }, 502);
    }
    if (response.status === 404) {
      return json({ error: 'GitHub repository or image branch not found.' }, 502);
    }
    return json({ error: 'Image upload failed.' }, 502);
  }

  const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${contentPath}`;
  return json({ imageUrl }, 201);
};

// ---------- router (called from the Durable Object) ----------

export const handleApi = async (
  request: Request,
  sqlStorage: SqlStorage,
  env: ApiEnv
): Promise<Response> => {
  if (request.method === 'OPTIONS') return preflight();

  ensureSchema(sqlStorage);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;

  if (path === '/api/secure/signup' && method === 'POST') {
    return handleSignup(request, sqlStorage, env);
  }
  if (path === '/api/secure/login' && method === 'POST') {
    return handleLogin(request, sqlStorage, env);
  }
  if (path === '/api/secure/me' && method === 'GET') {
    return handleGetMe(request, sqlStorage, env);
  }
  if (path === '/api/secure/account' && method === 'PUT') {
    return handleUpdateAccount(request, sqlStorage, env);
  }
  if (path === '/api/secure/password' && method === 'PUT') {
    return handleChangePassword(request, sqlStorage, env);
  }
  if (path === '/api/secure/reset' && method === 'DELETE') {
    sqlStorage.exec('DELETE FROM users');
    return json({ msg: 'reset' });
  }
  if (path === '/api/secure' && method === 'GET') {
    const rows = sqlStorage
      .exec('SELECT id, pseudo, password, created_at FROM users ORDER BY created_at ASC')
      .toArray() as unknown as UserRow[];
    return json({ users: rows.map(toUser) });
  }
  if (path.startsWith('/api/secure/') && method === 'GET') {
    const user = findUserById(sqlStorage, path.slice('/api/secure/'.length));
    return user ? json({ user: toUser(user) }) : json({ error: 'User not found' }, 404);
  }

  if (path === '/api/channels' && method === 'GET') return handleGetChannels(sqlStorage);
  if (path === '/api/channels/new' && method === 'POST') {
    return handleNewChannel(request, sqlStorage);
  }
  if (path.startsWith('/api/channels/') && method === 'DELETE') {
    return handleDeleteChannel(path.slice('/api/channels/'.length), sqlStorage);
  }

  if (path === '/api/messages' && method === 'GET') return handleGetMessages(url, sqlStorage);
  if (path === '/api/messages/new' && method === 'POST') {
    return handleNewMessage(request, sqlStorage);
  }
  if (path === '/api/messages' && method === 'DELETE') {
    const body = await readJson(request);
    return handleDeleteMessages(url, sqlStorage, body);
  }
  if (path.startsWith('/api/messages/') && method === 'DELETE') {
    return handleDeleteMessage(path.slice('/api/messages/'.length), request, sqlStorage);
  }

  return json({ error: 'Not found' }, 404);
};
