const CACHE_NAME = 'nomad-brasil-ghpages-v4';
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
  './data/venomous_animals.json',
  './data/panc_plants.json'
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
  if (event.request.method !== 'GET') return;

  // Para navegação HTML (páginas), prioriza rede para receber atualizações do GitHub Pages instantaneamente, caindo para cache se offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match('./index.html').then((res) => res || caches.match('./')))
    );
    return;
  }

  // Stale-while-revalidate para recursos estáticos e dados JSON
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});
