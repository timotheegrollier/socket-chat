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

  let pseudo = `ci${unique()}`;
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

  // ---------- account settings (authenticated) ----------
  const bearer = { authorization: `Bearer ${login.body.token}` };
  const jsonHeaders = { 'content-type': 'application/json' };

  const me = await request('/api/secure/me', { headers: bearer });
  assertStatus(me, 200, 'get me');
  assert(me.body.user && me.body.user._id === userId, 'me payload mismatch');
  assert(me.body.user.pseudo === pseudo, 'me pseudo mismatch');
  console.log('get me ok');

  const missingAuth = await request('/api/secure/me');
  assertStatus(missingAuth, 401, 'missing auth');
  console.log('missing auth ok');

  const signatureStart = login.body.token.lastIndexOf('.') + 1;
  const tamperedToken = login.body.token.slice(0, signatureStart) +
    (login.body.token[signatureStart] === 'A' ? 'B' : 'A') +
    login.body.token.slice(signatureStart + 1);
  const tampered = await request('/api/secure/me', {
    headers: { authorization: `Bearer ${tamperedToken}` },
  });
  assertStatus(tampered, 401, 'tampered token');
  console.log('tampered token ok');

  const unauthRename = await request('/api/secure/account', {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ pseudo: 'renamed' }),
  });
  assertStatus(unauthRename, 401, 'unauthenticated rename');
  console.log('unauthenticated rename ok');

  const invalidRename = await request('/api/secure/account', {
    method: 'PUT',
    headers: { ...jsonHeaders, ...bearer },
    body: JSON.stringify({ pseudo: 'ab' }),
  });
  assertStatus(invalidRename, 422, 'invalid pseudo');
  assert(Array.isArray(invalidRename.body.errors), 'invalid pseudo errors missing');
  console.log('invalid pseudo ok');

  // A second account lets us check case-insensitive uniqueness while the
  // rename endpoint ignores the caller's own current pseudo.
  const otherPseudo = `ci${unique()}`;
  const otherSignup = await request('/api/secure/signup', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      pseudo: otherPseudo,
      password,
      confirmPass: password,
      terms: true,
    }),
  });
  assertStatus(otherSignup, 201, 'second signup');

  const duplicateRename = await request('/api/secure/account', {
    method: 'PUT',
    headers: { ...jsonHeaders, ...bearer },
    body: JSON.stringify({ pseudo: otherPseudo.toUpperCase() }),
  });
  assertStatus(duplicateRename, 400, 'duplicate pseudo');
  assert(duplicateRename.body.error === 'Pseudo must be unique', 'duplicate pseudo error mismatch');
  console.log('duplicate pseudo ok');

  const oldPseudo = pseudo;
  const renamed = `ci${unique()}`;
  const rename = await request('/api/secure/account', {
    method: 'PUT',
    headers: { ...jsonHeaders, ...bearer },
    body: JSON.stringify({ pseudo: renamed }),
  });
  assertStatus(rename, 200, 'rename account');
  assert(rename.body.user && rename.body.user.pseudo === renamed, 'rename payload mismatch');
  assert(rename.body.user._id === userId, 'rename changed the user id');
  pseudo = renamed;
  console.log('rename account ok');

  const renamedProfile = await request(`/api/secure/${userId}`);
  assertStatus(renamedProfile, 200, 'profile after rename');
  assert(renamedProfile.body.user.pseudo === renamed, 'profile pseudo not updated');

  // Past messages follow the account's new name.
  const renamedMessages = await request(`/api/messages?channel=${channelName}`);
  assertStatus(renamedMessages, 200, 'messages after rename');
  assert(
    renamedMessages.body.messages[0].author === renamed,
    'past messages should use the new pseudo'
  );
  console.log('rename propagation ok');

  const oldPseudoLogin = await request('/api/secure/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ pseudo: oldPseudo, password }),
  });
  assertStatus(oldPseudoLogin, 401, 'old pseudo login');

  const renamedLogin = await request('/api/secure/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ pseudo: renamed, password }),
  });
  assertStatus(renamedLogin, 200, 'login after rename');
  assert(renamedLogin.body.userId === userId, 'login after rename user id mismatch');

  // Changing only the case is allowed for the account itself.
  const caseRename = await request('/api/secure/account', {
    method: 'PUT',
    headers: { ...jsonHeaders, ...bearer },
    body: JSON.stringify({ pseudo: renamed.toUpperCase() }),
  });
  assertStatus(caseRename, 200, 'case-only rename');
  pseudo = renamed.toUpperCase();
  assert(caseRename.body.user.pseudo === pseudo, 'case-only rename payload mismatch');
  console.log('case-only rename ok');

  const accountToken = renamedLogin.body.token;
  const concatAuth = { ...jsonHeaders, authorization: `Bearer ${accountToken}` };

  const unauthPassword = await request('/api/secure/password', {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ currentPassword: password, password: 'newsecret42', confirmPass: 'newsecret42' }),
  });
  assertStatus(unauthPassword, 401, 'unauthenticated password change');
  console.log('unauthenticated password change ok');

  const wrongCurrent = await request('/api/secure/password', {
    method: 'PUT',
    headers: concatAuth,
    body: JSON.stringify({
      currentPassword: 'not-my-password',
      password: 'newsecret42',
      confirmPass: 'newsecret42',
    }),
  });
  assertStatus(wrongCurrent, 400, 'wrong current password');
  assert(
    wrongCurrent.body.error === 'Current password is incorrect',
    'wrong current password error mismatch'
  );
  console.log('wrong current password ok');

  const passwordMismatch = await request('/api/secure/password', {
    method: 'PUT',
    headers: concatAuth,
    body: JSON.stringify({
      currentPassword: password,
      password: 'newsecret42',
      confirmPass: 'different42',
    }),
  });
  assertStatus(passwordMismatch, 422, 'password confirmation mismatch');
  console.log('password confirmation mismatch ok');

  const shortPassword = await request('/api/secure/password', {
    method: 'PUT',
    headers: concatAuth,
    body: JSON.stringify({ currentPassword: password, password: '1', confirmPass: '1' }),
  });
  assertStatus(shortPassword, 422, 'short new password');
  console.log('short new password ok');

  const changedPassword = 'newsecret42';
  const passwordChange = await request('/api/secure/password', {
    method: 'PUT',
    headers: concatAuth,
    body: JSON.stringify({
      currentPassword: password,
      password: changedPassword,
      confirmPass: changedPassword,
    }),
  });
  assertStatus(passwordChange, 200, 'change password');
  assert(passwordChange.body.message === 'Password updated', 'change password message mismatch');
  console.log('change password ok');

  const stalePasswordLogin = await request('/api/secure/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ pseudo, password }),
  });
  assertStatus(stalePasswordLogin, 401, 'old password login');

  const newPasswordLogin = await request('/api/secure/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ pseudo, password: changedPassword }),
  });
  assertStatus(newPasswordLogin, 200, 'login with new password');
  assert(newPasswordLogin.body.userId === userId, 'new password login user id mismatch');

  const meAfterPassword = await request('/api/secure/me', {
    headers: { authorization: `Bearer ${newPasswordLogin.body.token}` },
  });
  assertStatus(meAfterPassword, 200, 'me after password change');
  console.log('password change + re-login ok');
  // ---------- end account settings ----------

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
