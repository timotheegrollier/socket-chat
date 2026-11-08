// Socket Chat PWA — Service Worker v11
//
// Stratégie :
// - Navigation (index.html) : réseau d'abord, pour ne jamais servir une page
//   HTML en cache avec un CSS obsolète après un deploy.
// - Assets statiques same-origin (CSS, JS, images, icônes) : cache-first.
// - API REST, Socket.IO et requêtes cross-origin : jamais interceptés ni mis
//   en cache, pour toujours afficher des messages frais.

const CACHE_NAME = 'socket-chat-pwa-v11';

self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  const { request } = event;

  // Only same-origin GET requests are cached. The API and socket live on
  // other origins and must always hit the network.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/') || url.pathname.includes('/socket.io/')) return;

  const isNavigation = request.mode === 'navigate' ||
    (request.headers.get('Accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(response => {
      if (response) return response;
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

const deleteCache = async key => {
  await caches.delete(key);
};

const deleteOldCaches = async () => {
  const keepList = [CACHE_NAME];
  const keyList = await caches.keys();
  const toDelete = keyList.filter(k => !keepList.includes(k));
  await Promise.all(toDelete.map(deleteCache));
};

self.addEventListener('activate', event => {
  event.waitUntil(deleteOldCaches());
  event.waitUntil(self.clients.claim());
});
