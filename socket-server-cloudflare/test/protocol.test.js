const { io } = require('socket.io-client');

const URL = process.env.SOCKET_URL || 'http://127.0.0.1:8787';

function waitFor(socket, event, timeout = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeout);
    function handler(...args) {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(args);
    }
    socket.on(event, handler);
  });
}

function waitForPresence(socket, predicate, timeout = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('presence', handler);
      reject(new Error('timeout waiting for matching presence'));
    }, timeout);
    function handler(users) {
      if (predicate(users)) {
        clearTimeout(timer);
        socket.off('presence', handler);
        resolve(users);
      }
    }
    socket.on('presence', handler);
  });
}

function makeSocket() {
  const socket = io(URL, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 5_000,
    ...(process.env.ORIGIN
      ? { extraHeaders: { Origin: process.env.ORIGIN } }
      : {}),
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout connecting')), 5_000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function main() {
  const health = await fetch(`${URL}/health`);
  if (!health.ok) throw new Error(`health returned ${health.status}`);
  console.log('health ok');

  const alice = await makeSocket();
  const firstCount = await waitFor(alice, 'count');
  if (firstCount[0] !== 1) throw new Error(`alice expected first count 1, got ${firstCount[0]}`);
  console.log('count ok');

  const aliceJoined = waitForPresence(alice, (users) =>
    Array.isArray(users) && users.some((user) => user.name === 'alice'));
  alice.emit('join', 'alice');
  await aliceJoined;

  const newMsgPromise = waitFor(alice, 'newMsg');
  const savedMessage = {
    _id: '64b7f0000000000000000001',
    message: '  hello from the socket  ',
    author: 'alice',
    authorId: '64b7f0000000000000000002',
    channel: 'general',
    createdAt: '2026-01-01T10:00:00.000Z',
  };
  alice.emit('newMsg', { channel: 'general', message: savedMessage });
  const [newMsg] = await newMsgPromise;
  if (!newMsg || newMsg.channel !== 'general') throw new Error('newMsg payload mismatch');
  if (!newMsg.message || newMsg.message._id !== savedMessage._id) {
    throw new Error('newMsg message missing');
  }
  if (newMsg.message.message !== 'hello from the socket') {
    throw new Error('newMsg message not normalized');
  }
  if (newMsg.message.author !== 'alice' || newMsg.message.channel !== 'general') {
    throw new Error('newMsg message metadata mismatch');
  }
  console.log('newMsg ok');

  const legacyMsgPromise = waitFor(alice, 'newMsg');
  alice.emit('newMsg', {
    channel: 'general',
    message: { _id: 'broken', message: '   ', author: 'alice', channel: 'general' },
  });
  const [legacyMsg] = await legacyMsgPromise;
  if (!legacyMsg || legacyMsg.channel !== 'general' || legacyMsg.message) {
    throw new Error('newMsg should fall back to a channel-only payload');
  }
  console.log('newMsg fallback ok');

  const channelsChangedPromise = waitFor(alice, 'channelsChanged');
  alice.emit('channelsChanged', {});
  await channelsChangedPromise;
  console.log('channelsChanged ok');

  const channelDeletedPromise = waitFor(alice, 'channelDeleted');
  alice.emit('channelDeleted', { channel: 'ops' });
  const [deleted] = await channelDeletedPromise;
  if (!deleted || deleted.channel !== 'ops') throw new Error('channelDeleted payload mismatch');
  console.log('channelDeleted ok');

  const resetPromise = waitFor(alice, 'reset');
  alice.emit('resetTchat', { channel: 'general' });
  const [reset] = await resetPromise;
  if (!reset || reset.channel !== 'general') throw new Error('reset payload mismatch');
  console.log('reset ok');

  const bob = await makeSocket();
  const secondCount = await waitFor(bob, 'count');
  if (secondCount[0] !== 2) throw new Error(`bob expected count 2, got ${secondCount[0]}`);
  console.log('count x2 ok');

  bob.emit('join', 'bob');
  const users = await waitForPresence(alice, (list) =>
    Array.isArray(list) &&
    list.length === 2 &&
    list.some((user) => user.name === 'alice') &&
    list.some((user) => user.name === 'bob'));
  console.log('presence ok');

  const typingPromise = waitFor(bob, 'typing');
  alice.emit('typing', { name: 'alice', channel: 'general' });
  const [typing] = await typingPromise;
  if (!typing || typing.name !== 'alice' || typing.channel !== 'general') {
    throw new Error('typing payload mismatch');
  }
  console.log('typing ok');

  const stopTypingPromise = waitFor(bob, 'stopTyping');
  alice.emit('stopTyping', { channel: 'general' });
  const [stopped] = await stopTypingPromise;
  if (!stopped || stopped.channel !== 'general') throw new Error('stopTyping payload mismatch');
  console.log('stopTyping ok');

  bob.disconnect();
  alice.disconnect();
  console.log('ALL OK');
}

main().catch((error) => {
  console.error('TEST FAILED', error);
  process.exit(1);
});
