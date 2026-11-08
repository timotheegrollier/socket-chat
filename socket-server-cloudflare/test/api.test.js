const URL = process.env.API_URL || 'http://127.0.0.1:8787';

const unique = () => Math.random().toString(36).slice(2, 8);

async function request(path, options = {}) {
  const response = await fetch(URL + path, options);
  let body = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body, headers: response.headers };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertStatus(result, expected, label) {
  if (result.status !== expected) {
    throw new Error(
      `${label}: expected ${expected}, got ${result.status} (${JSON.stringify(result.body)})`
    );
  }
}

async function main() {
  const health = await request('/health');
  assertStatus(health, 200, 'health');
  assert(health.body && health.body.status === 'ok', 'health payload mismatch');
  console.log('health ok');

  // CORS preflight must succeed for the browser client.
  const preflight = await request('/api/messages', { method: 'OPTIONS' });
  assertStatus(preflight, 204, 'preflight');
  assert(
    preflight.headers.get('access-control-allow-origin') === '*',
    'preflight CORS header missing'
  );
  console.log('preflight ok');

  const pseudo = `ci${unique()}`;
  const password = 'secret42';

  // Validation mirrors the old express-validator responses.
  const invalidSignup = await request('/api/secure/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pseudo: 'ab', password: '1' }),
  });
  assertStatus(invalidSignup, 422, 'signup validation');
  assert(Array.isArray(invalidSignup.body.errors), 'signup errors missing');
  console.log('signup validation ok');

  const missingTerms = await request('/api/secure/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pseudo, password, confirmPass: password }),
  });
  assertStatus(missingTerms, 423, 'signup terms');
  assert(
    typeof missingTerms.body.termsError === 'string',
    'signup terms error missing'
  );
  console.log('signup terms ok');

  const mismatch = await request('/api/secure/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pseudo, password, confirmPass: 'different', terms: true }),
  });
  assertStatus(mismatch, 423, 'signup password mismatch');
  console.log('signup password mismatch ok');

  const signup = await request('/api/secure/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pseudo, password, confirmPass: password, terms: true }),
  });
  assertStatus(signup, 201, 'signup');
  assert(signup.body.message === 'Utilisateur créé !', 'signup message mismatch');
  console.log('signup ok');

  const duplicate = await request('/api/secure/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pseudo, password, confirmPass: password, terms: true }),
  });
  assertStatus(duplicate, 400, 'duplicate signup');
  assert(duplicate.body.error === 'Pseudo must be unique', 'duplicate error mismatch');
  console.log('duplicate signup ok');

  const badLogin = await request('/api/secure/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pseudo, password: 'wrong-password' }),
  });
  assertStatus(badLogin, 401, 'bad login');
  console.log('bad login ok');

  const login = await request('/api/secure/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pseudo, password }),
  });
  assertStatus(login, 200, 'login');
  assert(
    typeof login.body.userId === 'string' &&
      login.body.pseudo === pseudo &&
      typeof login.body.token === 'string',
    'login payload mismatch'
  );
  console.log('login ok');

  const userId = login.body.userId;
  const user = await request(`/api/secure/${userId}`);
  assertStatus(user, 200, 'get user');
  assert(user.body.user && user.body.user._id === userId, 'user payload mismatch');
  assert(user.body.user.pseudo === pseudo, 'user pseudo mismatch');
  console.log('get user ok');

  const missingUser = await request('/api/secure/000000000000000000000000');
  assertStatus(missingUser, 404, 'missing user');
  console.log('missing user ok');

  const channels = await request('/api/channels');
  assertStatus(channels, 200, 'channels');
  assert(Array.isArray(channels.body.channels), 'channels payload mismatch');
  assert(
    channels.body.channels[0] && channels.body.channels[0].name === 'general',
    'general channel must come first'
  );
  console.log('channels ok');

  const channelName = `ci-${unique()}`;
  const newChannel = await request('/api/channels/new', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: channelName }),
  });
  assertStatus(newChannel, 201, 'new channel');
  assert(
    newChannel.body.channel && newChannel.body.channel.name === channelName,
    'new channel payload mismatch'
  );

  const duplicateChannel = await request('/api/channels/new', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: channelName }),
  });
  assertStatus(duplicateChannel, 409, 'duplicate channel');
  console.log('new channel ok');

  const emptyMessage = await request('/api/messages/new', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: '   ', author: pseudo, channel: channelName }),
  });
  assertStatus(emptyMessage, 400, 'empty message');
  assert(emptyMessage.body.error === 'Message vide !', 'empty message error mismatch');
  console.log('empty message ok');

  const newMessage = await request('/api/messages/new', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: '  hello from the API  ',
      author: 'spoofed',
      authorId: userId,
      channel: channelName,
    }),
  });
  assertStatus(newMessage, 200, 'new message');
  const saved = newMessage.body.msg;
  assert(saved && saved._id, 'new message id missing');
  assert(saved.message === 'hello from the API', 'new message not trimmed');
  assert(saved.author === pseudo, 'new message author should come from the account');
  assert(saved.channel === channelName, 'new message channel mismatch');
  console.log('new message ok');

  const messages = await request(`/api/messages?channel=${channelName}`);
  assertStatus(messages, 200, 'get messages');
  assert(messages.body.channel === channelName, 'messages channel mismatch');
  assert(
    Array.isArray(messages.body.messages) && messages.body.messages.length === 1,
    'messages payload mismatch'
  );
  assert(messages.body.messages[0]._id === saved._id, 'messages content mismatch');
  console.log('get messages ok');

  // Attachments must only reference our own storage.
  const remoteImage = await request('/api/messages/new', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: '',
      authorId: userId,
      channel: channelName,
      imageUrl: 'https://example.com/evil.png',
    }),
  });
  assertStatus(remoteImage, 400, 'remote image rejected');
  console.log('remote image rejected ok');

  const forbiddenDelete = await request(`/api/messages/${saved._id}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ authorId: 'someone-else' }),
  });
  assertStatus(forbiddenDelete, 403, 'forbidden delete');
  console.log('forbidden delete ok');

  const deleteMessage = await request(`/api/messages/${saved._id}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ authorId: userId }),
  });
  assertStatus(deleteMessage, 200, 'delete message');
  console.log('delete message ok');

  const deleteChannel = await request(`/api/channels/${channelName}`, {
    method: 'DELETE',
  });
  assertStatus(deleteChannel, 200, 'delete channel');
  assert(deleteChannel.body.name === channelName, 'delete channel payload mismatch');
  console.log('delete channel ok');

  // Images need the GITHUB_TOKEN worker secret; without it the API reports 503
  // instead of crashing. CI runs the worker without secrets.
  const image = await request('/api/images', { method: 'POST' });
  assertStatus(image, 503, 'image upload without secret');
  console.log('image upload guard ok');

  const notFound = await request('/api/does-not-exist');
  assertStatus(notFound, 404, 'unknown API route');
  console.log('unknown route ok');

  console.log('API tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
