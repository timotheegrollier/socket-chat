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

  const newMsgPromise = waitFor(alice, 'newMsg');
  alice.emit('newMsg', {});
  const [newMsg] = await newMsgPromise;
  if (!newMsg) throw new Error('newMsg payload mismatch');
  console.log('newMsg ok');

  const resetPromise = waitFor(alice, 'reset');
  alice.emit('resetTchat', {});
  const [reset] = await resetPromise;
  if (!reset) throw new Error('reset payload mismatch');
  console.log('reset ok');

  alice.disconnect();
  console.log('ALL OK');
}

main().catch((error) => {
  console.error('TEST FAILED', error);
  process.exit(1);
});
