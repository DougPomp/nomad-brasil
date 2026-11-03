const CACHE_NAME = 'nomad-brasil-ghpages-v3';
const OFFLINE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './logo.svg',
  './banner.svg',
  './og-image.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './data/cities.json',
  './data/emergencies.json',
  './data/pois.json',
  './data/radio_frequencies.json',
  './data/survival.json',
  './data/venomous_animals.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS).catch((err) => console.warn(err));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      });
    }).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});
