const CACHE_NAME = 'midnight-market-offline-v1';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([
        OFFLINE_URL,
        '/pwa-icon-192.png',
        '/pwa-icon-512.png',
        '/pwa-icon-maskable-512.png',
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('midnight-market-offline-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cachedPage = await caches.match(request);
      return cachedPage || caches.match(OFFLINE_URL);
    })
  );
});
