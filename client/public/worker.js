self.addEventListener('install', e => {
    e.waitUntil(
      caches.open('socket-chat-pwa-v3').then(cache => {
        return cache.addAll([
          '/'
        ])
        .then(() => self.skipWaiting());
      })
    )
  };


  self.addEventListener('fetch', event => {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request);
      })
    );
  });


  const deleteCache = async (key) => {
    await caches.delete(key);
  };

  const deleteOldCaches = async () => {
    const cacheKeepList = ['socket-chat-pwa-v3'];
    const keyList = await caches.keys();
    const cachesToDelete = keyList.filter((key) => !cacheKeepList.includes(key));
    await Promise.all(cachesToDelete.map(deleteCache));
  };


  // Update a service worker
self.addEventListener('activate', event => {
    let cacheWhitelist = ['socket-chat-pwa-v3'];
    event.waitUntil(deleteOldCaches());
      event.waitUntil(
          caches.keys().then(cacheNames => {
              return Promise.all(
                  cacheNames.map(cacheName => {
                      if (cacheWhitelist.indexOf(cacheName) === -1) {
                          return caches.delete(cacheName);
                      }
                  })
              );
          })
      );
});
